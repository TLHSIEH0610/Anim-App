describe('web env', () => {
  it('loads', async () => {
    const mod = await import('../env')
    expect(mod).toBeTruthy()
  })
})

