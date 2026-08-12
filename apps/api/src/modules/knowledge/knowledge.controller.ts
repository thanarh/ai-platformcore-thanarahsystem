import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, Role } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { KnowledgeService } from './knowledge.service';

@Controller('knowledge')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.knowledgeService.findByTenant(user.tenantId?.toString());
  }

  @Post()
  @Roles(Role.ADMIN, Role.OWNER, Role.AI_ADMIN, Role.STAFF)
  create(@CurrentUser() user: any, @Body() body: any) {
    return this.knowledgeService.createSource({
      tenantId: user.tenantId?.toString(),
      name: body.name,
      type: body.type,
      fileName: body.fileName,
      fileUrl: body.fileUrl,
      fileMimeType: body.fileMimeType,
      fileSizeBytes: body.fileSizeBytes,
      metadata: body.metadata,
    });
  }

  @Post('search')
  search(@CurrentUser() user: any, @Body() body: { query: string; limit?: number }) {
    return this.knowledgeService.search(user.tenantId?.toString(), body.query, body.limit);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.OWNER, Role.AI_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.knowledgeService.deleteSource(id, user.tenantId?.toString());
  }
}
