import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

@Module({
  controllers: [CommentsController, NotificationsController],
  providers:   [CommentsService, NotificationsService],
})
export class CommentsModule {}
