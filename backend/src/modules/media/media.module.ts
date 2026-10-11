import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG, type AppConfig } from '../../config/index.js';
import { MediaController } from './api/media.controller.js';
import { MediaFacade } from './application/media.facade.js';
import {
  MEDIA_SETTINGS,
  buildMediaSettings,
} from './application/media-settings.js';
import { MediaService } from './application/media.service.js';
import { MediaAssetEntity } from './persistence/media-asset.entity.js';
import { MediaAssetRepository } from './persistence/media-asset.repository.js';
import { LocalMediaStorage } from './storage/local-media-storage.js';
import { MEDIA_STORAGE } from './storage/media-storage.js';

/**
 * Media library. The storage backend is chosen here, in one place: the local filesystem for development. A
 * different adapter (object storage) is a new class implementing `MediaStorage` and a different `useFactory`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MediaAssetEntity]),
    // Uploads are parsed into memory and capped while they are read, so an oversized body is refused (413) without
    // being buffered in full.
    MulterModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        limits: {
          fileSize: config.mediaMaxBytes,
          files: 1,
          fields: 0,
          parts: 2,
        },
      }),
    }),
  ],
  controllers: [MediaController],
  providers: [
    MediaAssetRepository,
    MediaService,
    MediaFacade,
    {
      provide: MEDIA_SETTINGS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => buildMediaSettings(config),
    },
    {
      provide: MEDIA_STORAGE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new LocalMediaStorage(config.mediaStorageRoot),
    },
  ],
  exports: [MediaFacade],
})
export class MediaModule {}
