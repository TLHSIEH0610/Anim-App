import { getOrCreateInstallId } from '../installId'

describe('getOrCreateInstallId', () => {
  let randomUUIDSpy: jest.SpyInstance | null = null

  beforeEach(() => {
    localStorage.clear()
    if (!globalThis.crypto) {
      // @ts-expect-error test stub
      globalThis.crypto = {}
    }
    randomUUIDSpy = jest.spyOn(globalThis.crypto as Crypto, 'randomUUID').mockReturnValue('uuid-1234')
  })

  afterEach(() => {
    randomUUIDSpy?.mockRestore()
    randomUUIDSpy = null
  })

  it('creates and persists an install id', () => {
    const first = getOrCreateInstallId()
    expect(first).toBe('uuid-1234')
    expect(localStorage.getItem('animapp_install_id')).toBe('uuid-1234')

    const second = getOrCreateInstallId()
    expect(second).toBe('uuid-1234')
  })
})
