import React from 'react';
import axios from 'axios';
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'


export default async function Page() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;

  if (sessionCookie === undefined) {
    redirect('/login');
  }



  let response;
  try {
    response = await axios.get(process.env.BACKEND_API_URL + '/api/checkauth', {
      headers: { Cookie: "session=" + sessionCookie }
    });
  } catch (error) {
    console.log("[*] Error in /app/page.jsx");
    console.log(error);
    redirect('/login');
  }




  if (response !== undefined && response.status === 200) {
    if (response.data.admin === 1) {
      redirect('/vm');
    } else {
      redirect('/vm');
    }
  }

  

  redirect('/login');
}