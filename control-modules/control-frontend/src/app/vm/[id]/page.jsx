import 'server-only';
import React from 'react';
import axios from 'axios';
import VirtualServerPage from '@/systemPages/UserPages/VirtualServer/VirtualServer';
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'


export default async function Page(props) {
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
    console.log("[*] Error in /app/user/vms/[id]/page.jsx");
    console.log(error);
    redirect('/');
  }

  // Await the params to ensure they are ready to be used
  const { id } = await props.params;

  try {
    if (response !== undefined) {
      if (response.status === 200) {
        return <VirtualServerPage virtualServerID={id} authdata={response.data} />;
      }
    }
  } catch (error) {
    console.log("[*] Error in /app/user/vms/[id]/page.jsx");
    console.log(error);
    redirect('/login');
  }

  

  redirect('/');
}
