'use client';
import {Fragment,useState,type FormEvent,type ComponentType,type ReactNode} from 'react';
import * as kit from '@/components/kit';

const {Button,Input,Card,CardHeader,CardTitle,CardDescription,CardContent,CardFooter,Dialog,DialogTrigger,DialogContent,DialogHeader,DialogTitle,DialogDescription,Table,TableHeader,TableBody,TableRow,TableHead,TableCell,Sidebar,SidebarHeader,SidebarContent,SidebarGroup,SidebarItem}=kit;
const Provider='SidebarProvider' in kit?kit.SidebarProvider as ComponentType<{children:ReactNode}>:Fragment;

export default function Consumer() {
  const [name,setName]=useState('Acme Studio'),[saved,setSaved]=useState(false),[invite,setInvite]=useState(false),[email,setEmail]=useState('');
  const [members,setMembers]=useState(['Alex Morgan','Sam Chen']);
  function save(event:FormEvent){event.preventDefault();setSaved(true);}
  function add(event:FormEvent){event.preventDefault();setMembers(current=>[...current,email]);setEmail('');setInvite(false);}
  return <Provider><div className="consumer-shell">
    <Sidebar className="consumer-nav" aria-label="Workspace navigation"><SidebarHeader>Acme Studio</SidebarHeader><SidebarContent><SidebarGroup><SidebarItem __WORKSPACE_LABEL__ active aria-current="page" onClick={()=>document.getElementById('workspace-details')?.scrollIntoView()}>Workspace</SidebarItem><SidebarItem __MEMBERS_LABEL__ onClick={()=>document.getElementById('workspace-members')?.scrollIntoView()}>Members</SidebarItem></SidebarGroup></SidebarContent></Sidebar>
    <main className="consumer-content"><h1 style={{fontFamily:__HEADING_FONT__}}>Workspace settings</h1><p>Manage your workspace name and members.</p>
      <Card id="workspace-details"><form onSubmit={save}><CardHeader><CardTitle>Workspace details</CardTitle><CardDescription>Your team sees this name.</CardDescription></CardHeader><CardContent><label htmlFor="workspace-name">Workspace name</label><Input id="workspace-name" required pattern=".*\S.*" value={name} onChange={event=>{setName(event.target.value);setSaved(false);}} /></CardContent><CardFooter className="consumer-actions"><Button type="submit">Save changes</Button><span role="status">{saved?'Saved in this sample.':''}</span></CardFooter></form></Card>
      <Card id="workspace-members"><CardHeader><CardTitle>Workspace members</CardTitle><CardDescription>People who can access this sample workspace.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead></TableRow></TableHeader><TableBody>{members.map(member=><TableRow key={member}><TableCell>{member}</TableCell><TableCell>Editor</TableCell></TableRow>)}</TableBody></Table></CardContent><CardFooter><Dialog open={invite} onOpenChange={setInvite}><DialogTrigger asChild><Button variant="outline">Invite a member</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Invite a member</DialogTitle><DialogDescription>Add a member to this sample. No email is sent.</DialogDescription></DialogHeader><form onSubmit={add} className="consumer-invite"><label htmlFor="invite-email">Email address</label><Input id="invite-email" type="email" required value={email} onChange={event=>setEmail(event.target.value)} /><Button type="submit">Add sample member</Button></form></DialogContent></Dialog></CardFooter></Card>
    </main></div></Provider>;
}
