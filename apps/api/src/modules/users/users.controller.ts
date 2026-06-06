import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { UpdateRoleDto } from './dto/update-role.dto';
import type { UsersService } from './users.service';

@ApiTags('admin/users')
@Controller({ path: 'admin/users', version: '1' })
@UseGuards(JwtAuthGuard)
@Roles(['admin'])
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query('page') page?: string, @Query('limit') limit?: string, @Query('q') q?: string) {
    return this.users.list({
      page: Number(page) || 1,
      limit: Number(limit) || 25,
      q,
    });
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.users.getById(id);
  }

  @Patch(':id/role')
  updateRole(
    @CurrentUser() actor: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.users.updateRole(actor.id, id, dto.role);
  }

  @Delete(':id')
  remove(@CurrentUser() actor: { id: string }, @Param('id') id: string) {
    return this.users.remove(actor.id, id);
  }
}
