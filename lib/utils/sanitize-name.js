/**
 * @fileoverview Utility functions for the plugin
 *
 * Includes code adapted from `homebridge-plugin-utils`:
 * - Source: https://github.com/hjdhjd/homebridge-plugin-utils/blob/main/src/util.ts
 *
 * ISC License
 * ===========
 *
 * Copyright (c) 2017-2025, HJD https://github.com/hjdhjd
 *
 * Permission to use, copy, modify, and/or distribute this software for any purpose
 * with or without fee is hereby granted, provided that the above copyright notice
 * and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
 * FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
 * OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
 * TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
 * THIS SOFTWARE.
 */

/**
 * Sanitize an accessory/service name according to HomeKit naming conventions.
 *
 * Starts and ends with a letter or number. Exception: may end with a period.
 * May have the following special characters: -"',.#&.
 * Must not include emojis. At most 64 characters (HAP's string limit).
 *
 * @param {string} name - The name to sanitize
 * @returns {string} The HomeKit-sanitized version of the name
 */
export function sanitizeName (name) {
  const cleaned = cleanName(name
    // Curly quotes (common in card titles) become their allowed straight forms.
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"'))
  if (cleaned.length <= MAX_NAME_LENGTH) return cleaned

  // Too long: cut at the last word break that fits, then tidy the end again
  const cut = cleaned.slice(0, MAX_NAME_LENGTH + 1)
  const lastSpace = cut.lastIndexOf(' ')
  return cleanName(lastSpace > 0 ? cut.slice(0, lastSpace) : cleaned.slice(0, MAX_NAME_LENGTH))
}

const MAX_NAME_LENGTH = 64

/**
 * @param {string} name
 * @returns {string}
 */
function cleanName (name) {
  return name
    // Replace any disallowed char (including emojis) with a space.
    .replace(/[^\p{L}\p{N}\-"'.,#&\s]/gu, ' ')
    // Collapse multiple spaces to one.
    .replace(/\s+/g, ' ')
    // Trim spaces at the beginning and end of the string.
    .trim()
    // Strip any leading non-letter/number.
    .replace(/^[^\p{L}\p{N}]+/u, '')
    // Collapse two or more trailing periods into one.
    .replace(/\.{2,}$/g, '.')
    // Remove any other trailing char that's not letter/number/period.
    .replace(/[^\p{L}\p{N}.]$/u, '')
}
