import React from 'react';
import type { GetServerSideProps } from 'next';
import { StatusPanel } from '@xrpm-login/ui-react';

interface Props { address: string }

export default function Dashboard({ address }: Props) {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <h1>Welcome!</h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>You are signed in as an XRPM holder.</p>
      <StatusPanel
        address={address}
        onSignOut={() => {
          document.cookie = 'xrpm_address=; Max-Age=0; Path=/';
          window.location.href = '/';
        }}
      />
    </main>
  );
}

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  const cookie = req.cookies['xrpm_address'];
  if (!cookie) return { redirect: { destination: '/', permanent: false } };
  return { props: { address: cookie } };
};
