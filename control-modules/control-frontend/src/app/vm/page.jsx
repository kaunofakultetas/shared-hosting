import 'server-only';
import React from 'react';
import axios from 'axios';
import VirtualServersPage from '@/systemPages/UserPages/VirtualServers/VirtualServers';
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'


export default async function Page() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;

  if (sessionCookie === undefined) {
    redirect('/');
  }



  let response;
  try {
    response = await axios.get(process.env.BACKEND_API_URL + '/api/checkauth', {
      headers: { Cookie: "session=" + sessionCookie }
    });
  } catch (error) {
    console.log("[*] Error in /app/user/vms/page.jsx");
    console.log(error);
    redirect('/');
  }



  try{
    if(response !== undefined){
      if (response.status === 200){
        return <VirtualServersPage authdata={response.data}/>;
      }
    }
  }
  catch(error){
    console.log("[*] Error in /app/user/vms/page.jsx");
    console.log(error);
    redirect('/login');
  }

  

  redirect('/');
}
