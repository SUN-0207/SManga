import { IsIn } from 'class-validator';

export class UpdateRoleDto {
  @IsIn(['user', 'admin'])
  role!: 'user' | 'admin';
}
