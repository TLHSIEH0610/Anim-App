require('@testing-library/jest-dom')

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })
require('dotenv').config({ path: path.join(__dirname, '.env.local') })

const { TextDecoder, TextEncoder } = require('util')
const { ReadableStream, TransformStream, WritableStream } = require('stream/web')

if (!globalThis.TextEncoder) globalThis.TextEncoder = TextEncoder
if (!globalThis.TextDecoder) globalThis.TextDecoder = TextDecoder
if (!globalThis.ReadableStream) globalThis.ReadableStream = ReadableStream
if (!globalThis.WritableStream) globalThis.WritableStream = WritableStream
if (!globalThis.TransformStream) globalThis.TransformStream = TransformStream
if (!globalThis.BroadcastChannel) {
  globalThis.BroadcastChannel = class BroadcastChannel {
    constructor() {}
    postMessage() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {
      return false
    }
  }
}

require('whatwg-fetch')

const { server } = require('./tests/msw/server')

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
