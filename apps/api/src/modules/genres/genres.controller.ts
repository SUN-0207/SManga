import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { GenresService } from './genres.service';

@ApiTags('genres')
@Controller({ path: 'genres', version: '1' })
export class GenresController {
  constructor(private readonly genres: GenresService) {}

  @Get()
  list() {
    return this.genres.list();
  }
}
