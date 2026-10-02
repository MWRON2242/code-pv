import React from 'react';
import type { StateProps } from '../types';
import { S0Grid } from './S0Grid';
import { S1ErrorLog } from './S1ErrorLog';
import { S2RedAttribution } from './S2RedAttribution';
import { S3FullRed } from './S3FullRed';
import { S4Empty } from './S4Empty';
import { S5Monster } from './S5Monster';
import { S6Shell } from './S6Shell';
import { S7SecondAttribution } from './S7SecondAttribution';
import { S8Desaturate } from './S8Desaturate';
import { S9Whiteout } from './S9Whiteout';
import { S10Flashback } from './S10Flashback';
import { S11Deleting } from './S11Deleting';
import { S12Husk } from './S12Husk';
import { S13Ashes } from './S13Ashes';
import { S14TwoDots } from './S14TwoDots';
import { S15Trash } from './S15Trash';
import { S16WriteYou } from './S16WriteYou';
import { S17Zeroing } from './S17Zeroing';
import { S18Confirm } from './S18Confirm';
import { S19Converge } from './S19Converge';
import { S20Title } from './S20Title';
import { S21Close } from './S21Close';
import { Placeholder } from './Placeholder';

/* ============================================================================
 * 状态注册表 —— S0 ~ S21 全部就位
 * ----------------------------------------------------------------------------
 * 已实现的状态在这里登记；未登记的自动落到 Placeholder（画面上会写「未实现」）。
 * 这样「做到哪了」在画面上就能看出来，不用查代码。
 * ==========================================================================*/

export const REGISTRY: Record<string, React.FC<StateProps>> = {
  S0: S0Grid,
  S1: S1ErrorLog,
  S2: S2RedAttribution,
  S3: S3FullRed,
  S4: S4Empty,
  S5: S5Monster,
  S6: S6Shell,
  S7: S7SecondAttribution,
  S8: S8Desaturate,
  S9: S9Whiteout,
  S10: S10Flashback,
  S11: S11Deleting,
  S12: S12Husk,
  S13: S13Ashes,
  S14: S14TwoDots,
  S15: S15Trash,
  S16: S16WriteYou,
  S17: S17Zeroing,
  S18: S18Confirm,
  S19: S19Converge,
  S20: S20Title,
  S21: S21Close,
};

export type StateComponent = React.FC<StateProps>;

export function componentFor(id: string): StateComponent {
  return REGISTRY[id] || (Placeholder as unknown as StateComponent);
}

export const isImplemented = (id: string) => Boolean(REGISTRY[id]);
