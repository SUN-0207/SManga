import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('comments')
@Controller({ path: 'comments', version: '1' })
export class CommentsController {
  constructor(private readonly svc: CommentsService) {}

  // Anonymous-OK: global OptionalJwtGuard sets user=null when no token
  @Get()
  listComments(
    @Query('targetType') targetType: string,
    @Query('targetId') targetId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @CurrentUser() user: { id: string } | null,
  ) {
    return this.svc.listComments(
      targetType,
      targetId,
      Math.max(1, Number(page)),
      Math.min(50, Math.max(1, Number(limit))),
      user?.id ?? null,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 * 60 } })
  @HttpCode(201)
  createComment(
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.svc.createComment(
      user.id,
      dto.targetType,
      dto.targetId,
      dto.parentId ?? null,
      dto.body,
    );
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 * 60 } })
  updateComment(
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.svc.updateComment(id, user.id, dto.body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  deleteComment(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.svc.deleteComment(id, user.id, user.role);
  }

  @Post(':id/react')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 * 60 } })
  reactComment(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.svc.toggleReact(id, user.id);
  }
}
