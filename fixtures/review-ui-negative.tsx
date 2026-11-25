export function BrokenControls({ setOpen }: { setOpen: (value: boolean) => void }) {
  return <>
    <button type="button"></button>
    <input id="email" type="email" />
    <div onClick={() => setOpen(true)}>Open preferences</div>
    <p className="low-contrast">Read this</p>
  </>;
}
