/**
 * Export all custom node types
 */

import { BaseNode } from './BaseNode'
import { RectNode } from './RectNode'
import { RoundNode } from './RoundNode'
import { CylinderNode } from './CylinderNode'
import { DiamondNode } from './DiamondNode'
import { IsoRectNode } from './IsoRectNode'
import { IsoCylinderNode } from './IsoCylinderNode'
import { SubgraphNode } from './SubgraphNode'
import { IsoSubgraphNode } from './IsoSubgraphNode'

// Flat node types
export const flatNodeTypes = {
  rect: RectNode,
  round: RoundNode,
  cylinder: CylinderNode,
  diamond: DiamondNode,
  default: BaseNode,
  stadium: RoundNode,
  circle: DiamondNode,
  hexagon: DiamondNode,
  parallelogram: RectNode,
  trapezoid: RectNode,
  subroutine: RectNode,
  subgraph: SubgraphNode,
}

// Isometric node types
// IsoSubgraphNode renders as a projected flat rhombus with 0.8 opacity
export const isoNodeTypes = {
  rect: IsoRectNode,
  round: IsoRectNode,
  cylinder: IsoCylinderNode,
  diamond: IsoRectNode,
  default: IsoRectNode,
  stadium: IsoRectNode,
  circle: IsoRectNode,
  hexagon: IsoRectNode,
  parallelogram: IsoRectNode,
  trapezoid: IsoRectNode,
  subroutine: IsoRectNode,
  subgraph: IsoSubgraphNode,
}

// Default export for backwards compatibility
export const nodeTypes = flatNodeTypes

export type { NodeData, AppNode } from './BaseNode'
export {
  BaseNode,
  RectNode,
  RoundNode,
  CylinderNode,
  DiamondNode,
  IsoRectNode,
  IsoCylinderNode,
  SubgraphNode,
  IsoSubgraphNode,
}
