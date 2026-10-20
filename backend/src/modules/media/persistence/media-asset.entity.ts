import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'media_assets' })
@Check('chk_media_assets_size', `"size_bytes" > 0`)
@Check('chk_media_assets_sha256', `"sha256" ~ '^[0-9a-f]{64}$'`)
@Check(
  'chk_media_assets_storage_key',
  `"storage_key" ~ '^[0-9a-f]{2}/[0-9a-f]{32}$'`,
)
export class MediaAssetEntity {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Index('UQ_media_assets_storage_key', { unique: true })
  @Column({ name: 'storage_key', type: 'varchar', length: 40 })
  storageKey: string;

  @Column({ name: 'original_filename', type: 'varchar', length: 255 })
  originalFilename: string;

  @Column({ name: 'content_type', type: 'varchar', length: 100 })
  contentType: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes: string;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  /** Descriptive metadata (optional; see domain/metadata.ts). Added by AddMediaMetadata1791780000000. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  title: string | null;

  @Column({ name: 'alt_text', type: 'varchar', length: 500, nullable: true })
  altText: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  caption: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  source: string | null;

  @Column({ name: 'rights_notes', type: 'varchar', length: 1000, nullable: true })
  rightsNotes: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @Column({ name: 'metadata_version', type: 'int', default: 1 })
  metadataVersion: number;

  @Index('idx_media_assets_created_at_id')
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
