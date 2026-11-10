import { APP_NAME } from '@/src/common/constants';
import Head from 'expo-router/head';

export function PageTitle({ title }: { title: string }) {
  return (
    <Head>
      <title>{`${title} / ${APP_NAME}`}</title>
    </Head>
  );
}
