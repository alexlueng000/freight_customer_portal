import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PortalUsersController, UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, PortalUsersController],
  providers: [UsersService],
})
export class UsersModule {}
