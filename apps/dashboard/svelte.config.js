import { vitePreprocess } from '@sveltejs/kit/vite';
import adapterNode from '@sveltejs/adapter-node';
import path from 'path';

import 'dotenv/config';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  preprocess: [vitePreprocess({})],

  kit: {
    adapter: adapterNode(),
    alias: {
      $lib: path.resolve('./src/lib'),
      $mail: path.resolve('./src/mail')
    }
  }
};

export default config;
