import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [CommentsController, NotificationsController],
  providers: [CommentsService, NotificationsService],
})
export class CommentsModule {}
