/** Smallest byte strings that carry each supported file's signature (not decodable images; the module only checks the signature). */
export const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('synthetic png body'),
]);
export const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from('synthetic jpeg body'),
]);
export const GIF = Buffer.from('GIF89a synthetic gif body');
export const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x10, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP synthetic body'),
]);
export const PDF = Buffer.from('%PDF-1.7 synthetic pdf body');
export const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
export const HTML = Buffer.from('<html><script>alert(1)</script></html>');
