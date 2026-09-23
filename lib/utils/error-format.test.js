import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorMessage, getStatusCode } from './error-format.js'

test('errorMessage adds the HTTP status of API errors', () => {
  const apiError = Object.assign(new Error('Unexpected response status code'), { statusCode: 403 })
  assert.equal(errorMessage(apiError), 'Unexpected response status code (HTTP 403)')
  assert.equal(errorMessage(new Error('getaddrinfo ENOTFOUND')), 'getaddrinfo ENOTFOUND')
  assert.equal(errorMessage('plain'), 'plain')
})

test('getStatusCode only returns numeric status codes', () => {
  assert.equal(getStatusCode({ statusCode: 500 }), 500)
  assert.equal(getStatusCode({ statusCode: '500' }), undefined)
  assert.equal(getStatusCode(new Error('x')), undefined)
  assert.equal(getStatusCode(null), undefined)
})
