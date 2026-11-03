import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { HomePage } from '@/features/home/HomePage';

describe('HomePage', () => {
  it('presenta la acción principal para crear un partido', () => {
    const router = createMemoryRouter([
      {
        path: '/',
        element: <HomePage service={{ listRecoverable: async () => [] }} />,
      },
    ]);

    render(<RouterProvider router={router} />);

    expect(screen.getByRole('heading', { name: /tu partido/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /nuevo partido/i })).toHaveAttribute(
      'href',
      '/matches/new',
    );
  });
});
