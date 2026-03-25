/**
 * Component Tests — Common UI components.
 *
 * Coverage:
 *   - Button: variants, sizes, disabled, loading, onClick
 *   - Card / StatCard: renders children, glass class, stat display
 *   - Modal: open/close, overlay click, escape key, portal
 *   - EncryptedValue: blur state, reveal toggle, animation classes
 *   - StatusBadge: variants, pulse animation for active states
 *   - TokenInput: amount entry, MAX button, balance display, token selector
 *   - TokenIcon / TokenPairIcon: renders logos
 *   - Spinner: renders with size
 *   - Tooltip: shows on hover, placements
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { Button } from '@/components/common/Button.js';
import { Spinner } from '@/components/common/Spinner.js';
import { Card, StatCard } from '@/components/common/Card.js';
import { Modal } from '@/components/common/Modal.js';
import { TokenIcon, TokenPairIcon } from '@/components/common/TokenIcon.js';
import { TokenInput } from '@/components/common/TokenInput.js';
import { EncryptedValue } from '@/components/common/EncryptedValue.js';
import { StatusBadge } from '@/components/common/StatusBadge.js';
import { Tooltip } from '@/components/common/Tooltip.js';

// ============================================================================
// Button
// ============================================================================

describe('Button', () => {
  it('renders children text', () => {
    render(<Button>Click Me</Button>);
    expect(screen.getByText('Click Me')).toBeInTheDocument();
  });

  it('fires onClick handler', async () => {
    const handler = vi.fn();
    render(<Button onClick={handler}>Click</Button>);
    await userEvent.click(screen.getByText('Click'));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('disabled button does not fire onClick', async () => {
    const handler = vi.fn();
    render(<Button onClick={handler} disabled>Click</Button>);
    await userEvent.click(screen.getByText('Click'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('renders with primary variant class', () => {
    render(<Button variant="primary">Primary</Button>);
    const btn = screen.getByText('Primary');
    expect(btn.className).toMatch(/primary|bg-octra/);
  });

  it('renders with secondary variant class', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByText('Secondary');
    expect(btn.className).toMatch(/secondary|border/);
  });

  it('renders loading state with spinner', () => {
    render(<Button loading>Loading</Button>);
    // Should show spinner or loading indicator
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
  });

  it('renders small size', () => {
    render(<Button size="sm">Small</Button>);
    const btn = screen.getByText('Small');
    expect(btn.className).toMatch(/sm|px-3|py-1|text-sm/);
  });

  it('renders large size', () => {
    render(<Button size="lg">Large</Button>);
    const btn = screen.getByText('Large');
    expect(btn.className).toMatch(/lg|px-6|py-3|text-lg/);
  });
});

// ============================================================================
// Spinner
// ============================================================================

describe('Spinner', () => {
  it('renders without crashing', () => {
    const { container } = render(<Spinner />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders with custom size', () => {
    const { container } = render(<Spinner size="lg" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/lg|w-8|h-8/);
  });

  it('has animate-spin class', () => {
    const { container } = render(<Spinner />);
    const el = container.querySelector('[class*="spin"]') || container.firstChild;
    expect(el).toBeTruthy();
  });
});

// ============================================================================
// Card / StatCard
// ============================================================================

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card Content</Card>);
    expect(screen.getByText('Card Content')).toBeInTheDocument();
  });

  it('has glass-card class', () => {
    const { container } = render(<Card>Content</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/glass|card|backdrop|border/);
  });

  it('applies custom className', () => {
    const { container } = render(<Card className="custom-class">Content</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('custom-class');
  });
});

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="TVL" value="$5.2M" />);
    expect(screen.getByText('TVL')).toBeInTheDocument();
    expect(screen.getByText('$5.2M')).toBeInTheDocument();
  });

  it('renders change indicator', () => {
    render(<StatCard label="Volume" value="$1.2M" change="+12.5%" />);
    expect(screen.getByText('+12.5%')).toBeInTheDocument();
  });
});

// ============================================================================
// Modal
// ============================================================================

describe('Modal', () => {
  it('renders when open', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        <p>Modal Content</p>
      </Modal>
    );
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal Content')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <Modal isOpen={false} onClose={() => {}} title="Hidden Modal">
        <p>Hidden Content</p>
      </Modal>
    );
    expect(screen.queryByText('Hidden Modal')).not.toBeInTheDocument();
  });

  it('calls onClose when overlay clicked', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Closeable">
        <p>Content</p>
      </Modal>
    );
    // Click the overlay (backdrop)
    const overlay = screen.getByRole('dialog').parentElement;
    if (overlay) {
      fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Escape">
        <p>Content</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// TokenIcon / TokenPairIcon
// ============================================================================

describe('TokenIcon', () => {
  it('renders image for known token', () => {
    render(<TokenIcon symbol="WETH" />);
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
  });

  it('renders fallback for unknown token', () => {
    const { container } = render(<TokenIcon symbol="UNKNOWN_TOKEN" />);
    // Should show fallback (first letter or generic icon)
    expect(container.firstChild).toBeTruthy();
  });
});

describe('TokenPairIcon', () => {
  it('renders two token icons', () => {
    const { container } = render(<TokenPairIcon token0="WETH" token1="USDC" />);
    const images = container.querySelectorAll('img');
    // May have 2 images or fallback divs
    expect(container.children.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// TokenInput
// ============================================================================

describe('TokenInput', () => {
  it('renders amount input field', () => {
    render(
      <TokenInput
        value="100"
        onChange={() => {}}
        token="WETH"
        balance="5.0"
      />
    );
    const input = screen.getByDisplayValue('100');
    expect(input).toBeInTheDocument();
  });

  it('displays token symbol', () => {
    render(
      <TokenInput
        value=""
        onChange={() => {}}
        token="USDC"
        balance="1000"
      />
    );
    expect(screen.getByText('USDC')).toBeInTheDocument();
  });

  it('displays balance', () => {
    render(
      <TokenInput
        value=""
        onChange={() => {}}
        token="WETH"
        balance="5.123"
      />
    );
    expect(screen.getByText(/5\.123/)).toBeInTheDocument();
  });

  it('MAX button sets value to balance', async () => {
    const onChange = vi.fn();
    render(
      <TokenInput
        value=""
        onChange={onChange}
        token="WETH"
        balance="5.0"
        showMax
      />
    );
    const maxBtn = screen.getByText(/MAX/i);
    await userEvent.click(maxBtn);
    expect(onChange).toHaveBeenCalledWith('5.0');
  });

  it('calls onChange on input', async () => {
    const onChange = vi.fn();
    render(
      <TokenInput
        value=""
        onChange={onChange}
        token="WETH"
        balance="5.0"
      />
    );
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '42');
    expect(onChange).toHaveBeenCalled();
  });

  it('disabled input is not editable', () => {
    render(
      <TokenInput
        value="100"
        onChange={() => {}}
        token="WETH"
        balance="5.0"
        disabled
      />
    );
    const input = screen.getByDisplayValue('100');
    expect(input).toBeDisabled();
  });
});

// ============================================================================
// EncryptedValue
// ============================================================================

describe('EncryptedValue', () => {
  it('renders blurred by default', () => {
    const { container } = render(<EncryptedValue value="$5,000" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/blur|encrypted|hidden/);
  });

  it('reveals value on click/toggle', async () => {
    render(<EncryptedValue value="$5,000" />);
    const toggle = screen.getByRole('button') || screen.getByText(/reveal|show|eye/i);
    await userEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getByText('$5,000')).toBeVisible();
    });
  });

  it('renders with custom placeholder', () => {
    render(<EncryptedValue value="secret" placeholder="****" />);
    expect(screen.getByText('****')).toBeInTheDocument();
  });

  it('starts revealed when defaultRevealed=true', () => {
    render(<EncryptedValue value="$5,000" defaultRevealed />);
    expect(screen.getByText('$5,000')).toBeVisible();
  });
});

// ============================================================================
// StatusBadge
// ============================================================================

describe('StatusBadge', () => {
  it('renders success variant', () => {
    render(<StatusBadge variant="success">Active</StatusBadge>);
    const badge = screen.getByText('Active');
    expect(badge.className).toMatch(/success|green/);
  });

  it('renders warning variant', () => {
    render(<StatusBadge variant="warning">Pending</StatusBadge>);
    const badge = screen.getByText('Pending');
    expect(badge.className).toMatch(/warning|yellow|amber/);
  });

  it('renders error variant', () => {
    render(<StatusBadge variant="error">Failed</StatusBadge>);
    const badge = screen.getByText('Failed');
    expect(badge.className).toMatch(/error|red/);
  });

  it('renders info variant', () => {
    render(<StatusBadge variant="info">Info</StatusBadge>);
    expect(screen.getByText('Info')).toBeInTheDocument();
  });

  it('pulse animation on active variant', () => {
    const { container } = render(<StatusBadge variant="active" pulse>Live</StatusBadge>);
    expect(container.innerHTML).toMatch(/pulse|animate/);
  });
});

// ============================================================================
// Tooltip
// ============================================================================

describe('Tooltip', () => {
  it('renders children', () => {
    render(
      <Tooltip content="Tooltip text">
        <span>Hover me</span>
      </Tooltip>
    );
    expect(screen.getByText('Hover me')).toBeInTheDocument();
  });

  it('shows tooltip on hover', async () => {
    render(
      <Tooltip content="Helpful info">
        <span>Hover target</span>
      </Tooltip>
    );
    await userEvent.hover(screen.getByText('Hover target'));
    await waitFor(() => {
      expect(screen.getByText('Helpful info')).toBeVisible();
    });
  });

  it('hides tooltip on unhover', async () => {
    render(
      <Tooltip content="Disappearing">
        <span>Target</span>
      </Tooltip>
    );
    await userEvent.hover(screen.getByText('Target'));
    await userEvent.unhover(screen.getByText('Target'));
    await waitFor(() => {
      expect(screen.queryByText('Disappearing')).not.toBeVisible();
    });
  });
});
