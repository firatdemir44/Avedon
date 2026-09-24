import type { YarnSearchParams } from '../../api/client';
import type { YarnWatchQuery } from '../products/filters';
import type { YarnDirectoryPreset } from '../../screens/yarns/YarnDirectoryScreen';
import { tr } from '../../i18n';

// İplik izleme (Faz 2, Adım 6). Sunucudaki yarnWatchQuerySchema `.strict()`:
// dizin aramasının izlemeye uygun ALT KÜMESİ gider. `inStock`, `companyId`,
// `limit` ve `offset` bilinçli olarak atılır — stok anlık bir durum, kalıcı bir
// tarif değil (kumaş tarafındaki kuralla aynı).
const joinList = (values?: string[]) => {
  const list = (values ?? []).filter(Boolean);
  return list.length ? list.join(',') : undefined;
};

export function yarnWatchQueryFromParams(params: YarnSearchParams): YarnWatchQuery | null {
  const query: YarnWatchQuery = { kind: 'iplik' };
  const search = params.search?.trim();
  if (search) query.search = search;
  const family = joinList(params.family);
  if (family) query.family = family;
  if (params.count !== undefined) {
    query.count = params.count;
    // Birim yalnızca numarayla birlikte anlamlı (dizin aramasıyla aynı kural).
    if (params.countUnit) query.countUnit = params.countUnit;
  }
  if (params.ply !== undefined) query.ply = params.ply;
  if (params.filaments !== undefined) query.filaments = params.filaments;
  const filamentType = joinList(params.filamentType);
  if (filamentType) query.filamentType = filamentType;
  const spinning = joinList(params.spinning);
  if (spinning) query.spinning = spinning;
  if (params.combing) query.combing = params.combing;
  if (params.luster) query.luster = params.luster;
  const endUse = joinList(params.endUse);
  if (endUse) query.endUse = endUse;
  if (params.colorState) query.colorState = params.colorState;
  const fiber = joinList(params.fiber);
  if (fiber) query.fiber = fiber;
  const certificate = joinList(params.certificate);
  if (certificate) query.certificate = certificate;
  if (params.sellerRole) query.sellerRole = params.sellerRole;
  // `kind` tek başına süzgeç sayılmaz: sunucu boş süzgeci reddediyor.
  return Object.keys(query).length > 1 ? query : null;
}

// İzlemeye çevrilirken düşen süzgeçler (kullanıcıya söylenir, sessizce yutulmaz).
export function unsupportedYarnWatchLabels(params: YarnSearchParams): string[] {
  return params.inStock ? [tr('stok')] : [];
}

// İzleme kuralından iplik dizinini aynı süzgeçle açmak için ön dolgu.
export function presetFromYarnWatchQuery(query: YarnWatchQuery): YarnDirectoryPreset {
  const split = (raw?: string) => (raw ? raw.split(',').filter(Boolean) : undefined);
  return {
    search: query.search,
    families: split(query.family),
    count: query.count !== undefined ? String(query.count) : undefined,
    countUnit: query.countUnit,
    filaments: query.filaments !== undefined ? String(query.filaments) : undefined,
    spinnings: split(query.spinning),
    combing: query.combing,
    filamentTypes: split(query.filamentType),
    luster: query.luster,
    endUses: split(query.endUse),
    colorState: query.colorState,
    sellerRole: query.sellerRole,
  };
}
