// Gerçek modelle görünüm kartı denemesi (ücretli çağrı). Canlıdaki fotoğraflı ürünlerin kapaklarını okur:
//   node --env-file=.env --import tsx scripts/try-fabric-look.ts [adet]
import { extractFabricLook } from '../src/skills/fabricLook/run';
import { describeLook } from '../src/skills/fabricLook/schema';

const LIVE = 'https://avedon-backend.onrender.com/api';
(async () => {
  const list = (await (await fetch(`${LIVE}/products`)).json()) as any;
  const withImage = list.products.filter((p: any) => p.hasImage).slice(0, Number(process.argv[2] ?? 2));
  for (const p of withImage) {
    const res = await fetch(`${LIVE}/products/${p.id}/image`);
    const type = res.headers.get('content-type') ?? '';
    let mediaType = type.split(';')[0];
    let data: string;
    if (type.includes('json')) {
      const url = ((await res.json()) as any).imageUrl as string;
      mediaType = url.slice(5, url.indexOf(';'));
      data = url.slice(url.indexOf(',') + 1);
    } else {
      data = Buffer.from(await res.arrayBuffer()).toString('base64');
    }
    const t0 = Date.now();
    const { look } = await extractFabricLook({ mediaType: mediaType as any, data });
    console.log(`${p.code} (${p.type}/${p.subtype}, ${p.content}) → ${describeLook(look)} | güven ${look.confidence} | ${Date.now() - t0} ms`);
    console.log('   ', JSON.stringify(look));
  }
})();
