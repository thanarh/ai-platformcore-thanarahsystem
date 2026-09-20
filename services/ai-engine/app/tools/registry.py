"""
Thanarah Tool Registry
All AI tools are registered here. MCP-ready architecture.
"""
import logging
from typing import Dict, Any, Optional
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ToolContext:
    tenant_id: str
    user_id: str
    conversation_id: Optional[str] = None
    metadata: dict = field(default_factory=dict)
    runtime_context: dict = field(default_factory=dict)


class ThanarahTool(ABC):
    """
    Base class for all Thanarah AI tools.
    MCP-ready: tools can be exposed through Model Context Protocol later.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        pass

    @property
    @abstractmethod
    def schema(self) -> dict:
        pass

    @property
    def required_permissions(self) -> tuple[str, ...]:
        return ()

    @abstractmethod
    async def execute(self, input: Any, context: ToolContext) -> Any:
        pass


class SearchKnowledgeTool(ThanarahTool):
    """Search the tenant's knowledge base."""

    @property
    def name(self) -> str:
        return "search_knowledge"

    @property
    def description(self) -> str:
        return "Search the organization's knowledge base for relevant information"

    @property
    def schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"}
            },
            "required": ["query"],
        }

    @property
    def required_permissions(self) -> tuple[str, ...]:
        return ("knowledge.read",)

    async def execute(self, input: dict, context: ToolContext) -> Any:
        from app.rag.pipeline import RAGPipeline
        rag = RAGPipeline()
        results = await rag.retrieve(context.tenant_id, input.get("query", ""), limit=5)
        return {"results": results, "count": len(results)}


class CreateContractTool(ThanarahTool):
    """Generate a contract document."""

    @property
    def name(self) -> str:
        return "create_contract"

    @property
    def description(self) -> str:
        return "Generate a contract document based on provided information"

    @property
    def schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "type": {"type": "string"},
                "parties": {"type": "array"},
                "terms": {"type": "object"},
            },
            "required": ["type"],
        }

    @property
    def required_permissions(self) -> tuple[str, ...]:
        return ("artifact_write",)

    async def execute(self, input: dict, context: ToolContext) -> Any:
        # Contract generation engine — full implementation in contract module
        return {
            "status": "pending",
            "message": "Contract generation queued",
            "contractType": input.get("type"),
        }


class CalculateTool(ThanarahTool):
    """Perform calculations."""

    @property
    def name(self) -> str:
        return "calculate"

    @property
    def description(self) -> str:
        return "Perform mathematical calculations safely"

    @property
    def schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "expression": {"type": "string", "description": "Mathematical expression to evaluate"}
            },
            "required": ["expression"],
        }

    @property
    def required_permissions(self) -> tuple[str, ...]:
        return ("compute",)

    async def execute(self, input: dict, context: ToolContext) -> Any:
        import ast
        import operator
        
        expr = input.get("expression", "")
        # Safe evaluation — only allow mathematical operations
        allowed_ops = {
            ast.Add: operator.add,
            ast.Sub: operator.sub,
            ast.Mult: operator.mul,
            ast.Div: operator.truediv,
            ast.Pow: operator.pow,
            ast.USub: operator.neg,
        }
        
        def safe_eval(node):
            if isinstance(node, ast.Num):
                return node.n
            elif isinstance(node, ast.BinOp):
                op = allowed_ops.get(type(node.op))
                if not op:
                    raise ValueError(f"Unsupported operator: {type(node.op)}")
                return op(safe_eval(node.left), safe_eval(node.right))
            elif isinstance(node, ast.UnaryOp):
                op = allowed_ops.get(type(node.op))
                if not op:
                    raise ValueError(f"Unsupported operator")
                return op(safe_eval(node.operand))
            else:
                raise ValueError(f"Unsupported expression type")
        
        try:
            tree = ast.parse(expr, mode="eval")
            result = safe_eval(tree.body)
            return {"result": result, "expression": expr}
        except Exception as e:
            return {"error": str(e), "expression": expr}


class ToolRegistry:
    """Central registry for all Thanarah tools."""

    def __init__(self):
        self._tools: Dict[str, ThanarahTool] = {}
        self._register_defaults()

    def _register_defaults(self):
        for tool in [SearchKnowledgeTool(), CreateContractTool(), CalculateTool()]:
            self._tools[tool.name] = tool

    def register(self, tool: ThanarahTool):
        self._tools[tool.name] = tool

    def get(self, name: str) -> Optional[ThanarahTool]:
        return self._tools.get(name)

    def list_tools(self) -> list:
        return [
            {
                "name": t.name,
                "description": t.description,
                "schema": t.schema,
                "requiredPermissions": list(t.required_permissions),
            }
            for t in self._tools.values()
        ]

    async def execute(self, name: str, input: Any, context: ToolContext) -> Any:
        tool = self.get(name)
        if not tool:
            raise ValueError(f"Tool not found: {name}")
        granted = set(context.metadata.get("authorizedPermissions", []))
        missing = set(tool.required_permissions) - granted
        if missing:
            raise PermissionError(f"Missing permissions: {', '.join(sorted(missing))}")
        logger.info(f"Executing tool: {name} for tenant {context.tenant_id}")
        return await tool.execute(input, context)
