import { Global, Module } from '@nestjs/common';
import { DRIZZLE, drizzleProvider } from './db.provider';

@Global()
@Module({
  providers: [drizzleProvider],
  exports: [DRIZZLE],
})
export class DbModule {}
