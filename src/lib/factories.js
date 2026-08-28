/**
 * A supplier has two names, and which one to use depends on who is reading.
 *
 * `name` is the legal one — "Shanghai Milanlux Lighting Co., Ltd" — and it is
 * what goes on paperwork, what a customs agent needs and what identifies the
 * company anywhere outside this office. It stays the identity: the CSV import
 * matches on it, and it is the only required one.
 *
 * `nickname` is what people here actually say. Orders are called "Milan 11",
 * not "Shanghai Milanlux Lighting Co., Ltd 11", and a list of suppliers written
 * out in full is a list nobody scans. So the short name is what the orders and
 * files screens show, and the long one stays a click away in the directory.
 */

/** What to call this supplier on screen: the nickname when there is one. */
export const factoryLabel = (factory) => factory?.nickname?.trim() || factory?.name || ''

/**
 * Reduce a name or a nickname to something comparable.
 *
 * Deliberately the same shape as `factoryNameKey` in csv.js — letters and
 * digits, folded to lower case — because "Milan", "MILAN" and "milán" are one
 * supplier however anyone types them.
 */
export const aliasKey = (value) =>
  (value ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '')

/**
 * Narrow several matches to the one that can actually have made the goods.
 *
 * A supplier with a plant and a sales office is two rows here, and they will
 * carry the same nickname because they are the same company — so "two matches"
 * usually means one company, not two, and giving up on it would be unhelpful.
 * The plant wins. Two rows still tied after that are genuinely different
 * suppliers and are left unresolved.
 */
const soleOrPlant = (matches) => {
  if (matches.length === 1) return matches[0]
  if (matches.length === 0) return null
  const plants = matches.filter((f) => (f.location_type ?? 'factory') === 'factory')
  return plants.length === 1 ? plants[0] : null
}

/**
 * The one supplier whose nickname or name matches this word, or null.
 *
 * The nickname is tried first and on equality, because that is what an order
 * reference is built from: "MILAN 11" is the nickname plus a number, and an
 * exact hit there is a fact rather than a guess. Only then does it fall back to
 * finding the word inside a legal name, which is how this worked before
 * nicknames existed and still catches suppliers that have not been given one.
 *
 * Ambiguity that survives `soleOrPlant` yields null. Two unrelated suppliers
 * answering to the same word means the word identifies neither, and attaching a
 * container to the wrong supplier is worse than attaching it to none — the
 * import lets a person pick instead.
 */
export const matchFactoryByAlias = (word, factories) => {
  const needle = aliasKey(word)
  if (needle.length < 3) return null

  const named = (factories ?? []).filter((f) => aliasKey(f.nickname) === needle)
  if (named.length > 0) return soleOrPlant(named)

  return soleOrPlant((factories ?? []).filter((f) => aliasKey(f.name).includes(needle)))
}

/**
 * The supplier whose LEGAL name this is, or null.
 *
 * For documents that name the company in full -- a commercial invoice puts
 * "WenZhou YueQiu BakeLite Electric Appliances Co.,LTD." at the top of every
 * page. That is the opposite direction from matchFactoryByAlias, which is given
 * a short word and hunts for it inside the name; here the whole name is stated
 * and only an exact match will do.
 */
export const matchFactoryByName = (name, factories) => {
  const needle = aliasKey(name)
  if (needle.length < 6) return null
  return soleOrPlant((factories ?? []).filter((f) => aliasKey(f.name) === needle))
}

/** Whether a search box's text matches this supplier's either name. */
export const matchesAlias = (factory, query) => {
  const needle = aliasKey(query)
  if (!needle) return true
  return aliasKey(factory?.nickname).includes(needle) || aliasKey(factory?.name).includes(needle)
}
