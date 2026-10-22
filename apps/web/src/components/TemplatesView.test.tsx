import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { WorkoutTemplate } from '@spotter/shared';

import { TemplatesView } from './TemplatesView.js';

const template: WorkoutTemplate = {
  id: '6ad8cf18-123c-43ed-a36c-3b87862ef23a',
  name: 'Four day split',
  isActive: true,
  notes: 'Alternate upper and lower days.',
  exercises: [],
  createdAt: '2026-10-22T00:00:00.000Z',
  updatedAt: '2026-10-22T00:00:00.000Z',
};

const baseProps = {
  online: true,
  exercises: [],
  templates: [template],
  onNavigate: () => {},
  onRefresh: async () => {},
  onError: () => {},
};

describe('template library screens', () => {
  it('renders templates as a compact list without editing controls', () => {
    const html = renderToStaticMarkup(
      <TemplatesView {...baseProps} routePath="/templates" />,
    );

    expect(html).toContain('class="template-library-list"');
    expect(html).toContain('Four day split');
    expect(html).toContain('Add template');
    expect(html).not.toContain('Template name');
    expect(html).not.toContain('Save weekly template');
  });

  it('shows edit and delete actions on the read-only details page', () => {
    const html = renderToStaticMarkup(
      <TemplatesView {...baseProps} routePath={`/templates/${template.id}`} />,
    );

    expect(html).toContain('<h2>Four day split</h2>');
    expect(html).toContain('aria-label="Edit Four day split"');
    expect(html).toContain('aria-label="Delete Four day split"');
    expect(html).toContain('Alternate upper and lower days.');
    expect(html).not.toContain('Template name');
  });

  it('isolates editable fields on the edit route', () => {
    const html = renderToStaticMarkup(
      <TemplatesView
        {...baseProps}
        routePath={`/templates/${template.id}/edit`}
      />,
    );

    expect(html).toContain('<h2>Edit Four day split</h2>');
    expect(html).toContain('Template name');
    expect(html).toContain('Save weekly template');
    expect(html).not.toContain('aria-label="Delete Four day split"');
  });
});
