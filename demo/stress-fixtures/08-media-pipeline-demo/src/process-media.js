import sharp from 'sharp';

const input = process.argv[2] || 'input.png';
const output = process.argv[3] || 'output.png';
await sharp(input).resize(256).toFile(output);
