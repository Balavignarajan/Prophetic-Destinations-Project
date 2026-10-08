import { Global, Module } from '@nestjs/common';
import { APP_CONFIG } from './app-config.js';
import { loadConfig } from './load-config.js';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: loadConfig }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
