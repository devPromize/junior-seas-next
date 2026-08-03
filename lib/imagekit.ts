import ImageKit from 'imagekit';

// Server-side ImageKit instance (private key stays on the server). Reads the
// NEXT_PUBLIC_* env var names that actually exist, falling back to the bare
// names for safety.
const imagekit = new ImageKit({
  publicKey:
    process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY ||
    process.env.IMAGEKIT_PUBLIC_KEY!,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY!,
  urlEndpoint:
    process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT ||
    process.env.IMAGEKIT_URL_ENDPOINT!,
});

export default imagekit;
