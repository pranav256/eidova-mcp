import { Button } from './components/ui/button';
import { Input } from './components/ui/input';

export function Controls({ setOpen }: { setOpen: (value: boolean) => void }) {
  return <>
    <Button type="button">Save</Button>
    <label htmlFor="email">Email</label>
    <Input id="email" type="email" />
    <div role="button" tabIndex={0} onClick={() => setOpen(true)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(true); } }}>Open preferences</div>
    <p className="readable">Read this</p>
  </>;
}
