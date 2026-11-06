'use client';

import Shell from '../../components/Shell';
import { Catalog } from '../../components/Learning';
export default function Page() {
  return <Shell publicPage>{user => <Catalog user={user} />}</Shell>;
}
