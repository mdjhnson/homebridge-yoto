/**
 * @fileoverview TV input identifiers and display order.
 */

/** Identifiers from here up are derived from the input subtype */
const FIRST_HASHED_IDENTIFIER = 2
const IDENTIFIER_RANGE = 999_998

/**
 * Pick a stable identifier for an input, so Home scenes that select an input
 * keep pointing at the same card when other inputs are added or removed.
 * Collisions move to the next free identifier.
 * @param {string} subtype
 * @param {Set<number>} used - Identifiers already taken (updated in place)
 * @returns {number}
 */
export function allocateInputIdentifier (subtype, used) {
  // FNV-1a
  let hash = 0x811c9dc5
  for (let i = 0; i < subtype.length; i++) {
    hash ^= subtype.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  let offset = hash % IDENTIFIER_RANGE
  while (used.has(FIRST_HASHED_IDENTIFIER + offset)) {
    offset = (offset + 1) % IDENTIFIER_RANGE
  }
  const identifier = FIRST_HASHED_IDENTIFIER + offset
  used.add(identifier)
  return identifier
}

/**
 * Pick identifiers for a set of inputs. An input that already has one keeps
 * it, so adding or removing other inputs never moves it (a hash collision
 * would otherwise depend on which inputs exist). New inputs get one from
 * `allocateInputIdentifier`.
 * @param {string[]} subtypes - Inputs to identify, in allocation order
 * @param {Map<string, number>} current - Identifiers the inputs already have
 * @param {Iterable<number>} reserved - Identifiers no input may take
 * @returns {Map<string, number>} Identifier by subtype
 */
export function allocateInputIdentifiers (subtypes, current, reserved) {
  const used = new Set(reserved)
  /** @type {Map<string, number>} */
  const result = new Map()
  for (const subtype of subtypes) {
    const identifier = current.get(subtype)
    if (identifier !== undefined && identifier >= FIRST_HASHED_IDENTIFIER && !used.has(identifier)) {
      result.set(subtype, identifier)
      used.add(identifier)
    }
  }
  for (const subtype of subtypes) {
    if (!result.has(subtype)) result.set(subtype, allocateInputIdentifier(subtype, used))
  }
  return result
}

/**
 * Encode the Television DisplayOrder characteristic: one TLV entry (type 1,
 * uint32 little-endian identifier) per input, separated by empty TLVs.
 * @param {number[]} identifiers - In display order
 * @returns {string} Base64 TLV8
 */
export function encodeDisplayOrder (identifiers) {
  /** @type {Buffer[]} */
  const parts = []
  identifiers.forEach((identifier, index) => {
    if (index > 0) parts.push(Buffer.from([0x00, 0x00]))
    const entry = Buffer.alloc(6)
    entry.writeUInt8(0x01, 0)
    entry.writeUInt8(4, 1)
    entry.writeUInt32LE(identifier, 2)
    parts.push(entry)
  })
  return Buffer.concat(parts).toString('base64')
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/**
 * Sort alphabetically by name, ignoring case and accents, with numbers in
 * numeric order ("Book 2" before "Book 10").
 * @template {{ name: string }} T
 * @param {T[]} items
 * @returns {T[]}
 */
export function sortByName (items) {
  return [...items].sort((a, b) => collator.compare(a.name, b.name))
}
