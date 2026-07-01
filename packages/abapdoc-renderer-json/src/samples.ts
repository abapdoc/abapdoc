/**
 * Test fixture — a non-trivial {@link DocumentationModel} used by every
 * `render.spec.ts` in this package.
 *
 * Contains:
 * - 1 class with 2 methods (one with @parameter, one with @return + @raising),
 *   where the second method's description includes a literal `<script>` so
 *   the escaping test has something to look at.
 * - 1 interface,
 * - 1 function module,
 * - 1 table.
 *
 * The fixture is hand-built (not generated from real ABAP) so it stays
 * stable across parser changes — renderers must accept any model that
 * conforms to {@link DocumentationModelSchema}.
 */

import type { DocumentationModel } from '@abapdoc/model';
import {
  DOCUMENTATION_MODEL_VERSION,
} from '@abapdoc/model';

export const sampleModel: DocumentationModel = {
  version: DOCUMENTATION_MODEL_VERSION,
  source: {
    provider: 'test-fixture',
    rootDir: '/test/petstore',
  },
  objects: [
    {
      kind: 'class',
      name: 'zcl_pet_service',
      visibility: 'public',
      superclass: 'cl_abap_object',
      interfaces: ['zif_pet_service'],
      doc: {
        summary: 'Pet service — manages pet records.',
        description: 'Wraps the pet DDIC table and exposes CRUD-style methods.',
        tags: [
          { kind: 'see', target: 'zif_pet_service' },
        ],
        sourceLocation: { file: 'zcl_pet_service.abap', startLine: 1, endLine: 50 },
      },
      methods: [
        {
          name: 'get_pet',
          parameters: [
            {
              name: 'iv_pet_id',
              direction: 'importing',
              type: 'i',
              doc: {
                summary: 'Pet ID',
                tags: [],
                sourceLocation: { file: 'zcl_pet_service.abap', startLine: 10, endLine: 12 },
              },
            },
          ],
          returning: {
            name: 'rv_pet',
            direction: 'returning',
            type: 'zpet_s',
          },
          exceptions: [],
          visibility: 'public',
          doc: {
            summary: 'Reads a single pet by ID.',
            description: 'Returns a pet structure or raises cx_not_found.',
            tags: [
              { kind: 'parameter', name: 'iv_pet_id', description: 'the pet ID' },
              { kind: 'return', description: 'the pet record' },
            ],
            sourceLocation: { file: 'zcl_pet_service.abap', startLine: 8, endLine: 18 },
          },
          sourceLocation: { file: 'zcl_pet_service.abap', startLine: 8, endLine: 22 },
        },
        {
          name: 'save_pet',
          parameters: [
            {
              name: 'is_pet',
              direction: 'importing',
              type: 'zpet_s',
            },
          ],
          exceptions: [
            { name: 'cx_sy_foreign_lock' },
            { name: 'cx_pet_validation', sourceLocation: { file: 'zcl_pet_service.abap', startLine: 40, endLine: 40 } },
          ],
          visibility: 'public',
          doc: {
            summary: 'Persists the pet record.',
            // Intentionally contains a `<script>` tag to exercise escaping.
            description: 'Persists <script>alert("xss")</script> the given pet structure.',
            tags: [
              { kind: 'return', description: 'nothing — this method raises on failure' },
              { kind: 'raising', name: 'cx_sy_foreign_lock', description: 'pet is locked' },
              { kind: 'raising', name: 'cx_pet_validation' },
              { kind: 'see', target: 'zpet_s' },
              { kind: 'custom', name: 'since', body: '1.2.0' },
            ],
            sourceLocation: { file: 'zcl_pet_service.abap', startLine: 30, endLine: 45 },
          },
          sourceLocation: { file: 'zcl_pet_service.abap', startLine: 30, endLine: 48 },
        },
      ],
      sourceLocation: { file: 'zcl_pet_service.abap', startLine: 1, endLine: 50 },
    },
    {
      kind: 'interface',
      name: 'zif_pet_service',
      methods: [
        {
          name: 'get_pet',
          parameters: [],
          exceptions: [],
          visibility: 'public',
          sourceLocation: { file: 'zif_pet_service.abap', startLine: 5, endLine: 7 },
        },
      ],
      doc: {
        summary: 'Public contract for the pet service.',
        tags: [],
        sourceLocation: { file: 'zif_pet_service.abap', startLine: 1, endLine: 10 },
      },
      sourceLocation: { file: 'zif_pet_service.abap', startLine: 1, endLine: 12 },
    },
    {
      kind: 'function-module',
      name: 'z_fm_create_pet',
      parameters: [
        { name: 'iv_name', direction: 'importing', type: 'string' },
        { name: 'ev_id', direction: 'exporting', type: 'i' },
      ],
      exceptions: [],
      doc: {
        summary: 'Creates a pet record.',
        tags: [],
        sourceLocation: { file: 'z_fm_create_pet.abap', startLine: 1, endLine: 20 },
      },
      sourceLocation: { file: 'z_fm_create_pet.abap', startLine: 1, endLine: 30 },
    },
    {
      kind: 'table',
      name: 'zpet_t',
      fields: [
        { kind: 'builtin', name: 'client' },
        { kind: 'builtin', name: 'pet_id' },
        { kind: 'data-element', name: 'zpet_name' },
      ],
      doc: {
        summary: 'Pet master table.',
        tags: [],
        sourceLocation: { file: 'zpet_t.abap', startLine: 1, endLine: 10 },
      },
      sourceLocation: { file: 'zpet_t.abap', startLine: 1, endLine: 15 },
    },
  ],
};