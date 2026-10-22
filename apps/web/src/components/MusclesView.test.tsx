import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Muscle } from '@spotter/shared';

import { MusclesView } from './MusclesView.js';

const timestamp = '2026-10-22T00:00:00.000Z';

describe('muscle directory hierarchy', () => {
  it('renders a level-one group, an indented subgroup, and clickable leaves', () => {
    const muscles: Muscle[] = [
      muscle('Anterior', 'Deltoid'),
      muscle('Lateral', 'Deltoid'),
      muscle('Supraspinatus', null),
    ];

    const html = renderToStaticMarkup(<MusclesView muscles={muscles} />);

    expect(html).toContain('<h3 class="muscle-tree-parent">Shoulders</h3>');
    expect(html).toContain(
      '<li class="muscle-tree-branch"><span>Deltoid</span>',
    );
    expect(html).toContain('>Anterior<span aria-hidden="true">↗</span></a>');
    expect(html).toContain(
      '>Supraspinatus<span aria-hidden="true">↗</span></a>',
    );
    expect(html).not.toContain('href="https://exrx.net/Shoulders"');
  });
});

function muscle(name: string, subgroup: string | null): Muscle {
  return {
    id: crypto.randomUUID(),
    name,
    group: 'Shoulders',
    subgroup,
    referenceUrl: `https://exrx.net/${name}`,
    isBuiltin: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
