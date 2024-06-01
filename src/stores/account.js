import { defineStore } from 'pinia';
import { ethers } from 'ethers';

export const useAccount = defineStore('account', {
  state: () => ({
    active: false,
    provider: null,
    signer: null,
    address: '',
  }),
  actions: {
    // any amount of arguments, return a promise or not
    async setProvider(provider) {
      // you can directly mutate the state
      this.provider = provider;
      provider.provider.on('accountsChanged', async (accounts) => {
        this.address = ethers.utils.getAddress(accounts[0]);
        this.signer = await this.provider.getSigner();
        // TODO: Sign message again here and fetch data
      });
      this.signer = await this.provider.getSigner();
      this.address = await this.signer.getAddress();
      this.active = true;
      const result = await this.signer.signMessage('Reza');
      console.log(result);
    },
    disconnect() {
      this.active = false;
      this.provider = null;
      this.signer = null;
      this.address = '';
    },
  },
});
