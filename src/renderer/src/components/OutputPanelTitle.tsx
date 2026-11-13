import type { ComponentPropsWithRef } from 'react';
import { forwardRef } from 'react';

import chrome from './OutputPanelChrome.module.css';

const OutputPanelTitle = forwardRef<HTMLHeadingElement, ComponentPropsWithRef<'h2'>>(({ className, ...props }, ref) => (
  <h2
    {...props}
    ref={ref}
    className={[chrome['title'], className].filter(Boolean).join(' ')}
  />
));

OutputPanelTitle.displayName = 'OutputPanelTitle';

export default OutputPanelTitle;
