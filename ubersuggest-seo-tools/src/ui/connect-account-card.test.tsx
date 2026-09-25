import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConnectAccountCard } from './connect-account-card';

const CONNECT_URL =
  'http://localhost/wp-admin/options-general.php?page=ubs-seo';

describe('ConnectAccountCard', () => {
  it('asks a never-connected site to connect', () => {
    render(<ConnectAccountCard connectUrl={CONNECT_URL} expired={false} />);

    expect(
      screen.getByText('Connect your Ubersuggest account'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveTextContent('Connect account');
  });

  // The two states differ by one boolean, and getting it backwards would tell a
  // brand-new site its session expired — worth pinning both.
  it('asks a dropped session to RE-connect', () => {
    render(<ConnectAccountCard connectUrl={CONNECT_URL} expired={true} />);

    expect(
      screen.getByText('Reconnect your Ubersuggest account'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveTextContent('Reconnect account');
  });

  // The app renders inside a same-origin iframe in wp-admin: without _top the
  // settings page would load into the frame, wp-admin chrome and all.
  it('breaks out of the iframe to reach wp-admin', () => {
    render(<ConnectAccountCard connectUrl={CONNECT_URL} expired={false} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', CONNECT_URL);
    expect(link).toHaveAttribute('target', '_top');
  });
});
