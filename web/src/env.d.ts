// @dotrino/identity 0.122.0 no declara `sealerChain()` en su `index.d.ts`, aunque el código
// lo tiene (src/index.js). Versiones posteriores del pilar ya lo declaran.
import '@dotrino/identity'

declare module '@dotrino/identity' {
  interface Identity {
    sealerChain (): Promise<Array<{ profileId: string, members?: Array<{ pub: string, label?: string, cn?: string }> }>>
  }
}
