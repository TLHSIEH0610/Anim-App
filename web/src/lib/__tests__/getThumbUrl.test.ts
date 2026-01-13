import { getThumbUrl } from '../api'

describe('getThumbUrl', () => {
  it('builds a purchased cover thumbnail URL', () => {
    const url = getThumbUrl({ bookId: 123, token: 't', width: 320, height: 200, version: 7 })
    expect(url).toContain('/books/123/cover-thumb-public')
    expect(url).toContain('w=320')
    expect(url).toContain('h=200')
    expect(url).toContain('token=t')
    expect(url).toContain('v=7')
  })

  it('builds a template/media thumbnail URL', () => {
    const url = getThumbUrl({ path: 'stories/cover.png', token: 't', width: 100, height: 100 })
    expect(url).toContain('/books/media/resize-public')
    expect(url).toContain('path=stories%2Fcover.png')
    expect(url).toContain('w=100')
    expect(url).toContain('h=100')
    expect(url).toContain('token=t')
  })
})

