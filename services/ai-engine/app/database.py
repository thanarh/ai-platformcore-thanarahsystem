import logging
import motor.motor_asyncio
from app.config import settings

logger = logging.getLogger(__name__)

client: motor.motor_asyncio.AsyncIOMotorClient = None
db = None


async def init_db():
    global client, db

    uri = settings.mongodb_uri
    try:
        test_client = motor.motor_asyncio.AsyncIOMotorClient(
            uri,
            serverSelectionTimeoutMS=10000,
            connectTimeoutMS=10000,
        )
        await test_client.admin.command("ping")
        client = test_client
        db = client.thanarah_ai
        await db.ai_memories.create_index([("tenantId", 1), ("userId", 1), ("createdAt", -1)])
        await db.knowledge_chunks.create_index([("tenantId", 1), ("chunkIndex", 1)])
        await db.knowledge_chunks.create_index([("sourceId", 1)])
        await db.ai_response_cache.create_index("key", unique=True)
        await db.ai_response_cache.create_index([("promptKey", 1), ("updatedAt", -1)])
        await db.ai_response_cache.create_index(
            [("tenantId", 1), ("userId", 1), ("profile", 1), ("createdAt", -1)]
        )
        await db.ai_response_cache.create_index("expiresAt", expireAfterSeconds=0)
        await db.ai_daily_learning.create_index(
            [("day", 1), ("tenantId", 1), ("userId", 1)],
            unique=True,
        )
        await db.ai_daily_learning.create_index(
            [("tenantId", 1), ("userId", 1), ("day", -1)]
        )
        await db.ai_task_groups.create_index([("tenantId", 1), ("userId", 1), ("updatedAt", -1)])
        await db.ai_tasks.create_index([("groupId", 1), ("updatedAt", 1)])
        await db.ai_tasks.create_index([("tenantId", 1), ("userId", 1), ("updatedAt", -1)])
        await db.ai_task_dependencies.create_index(
            [("taskId", 1), ("dependsOn", 1)], unique=True
        )
        await db.ai_artifacts.create_index([("tenantId", 1), ("userId", 1), ("createdAt", -1)])
        await db.ai_artifacts.create_index("expiresAt", expireAfterSeconds=0)
        logger.info("✅ MongoDB connected successfully")
    except Exception as e:
        logger.warning("⚠️  MongoDB not yet reachable — AI engine starting in degraded mode")
        logger.warning("   Add this host's IP to MongoDB Atlas Network Access and restart")
        logger.debug("Connection error: %s", str(e)[:200])
        db = None


def get_db():
    return db
