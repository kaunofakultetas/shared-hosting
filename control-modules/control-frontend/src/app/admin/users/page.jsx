import 'server-only';
import React from 'react';
import axios from 'axios';
import UsersListPage from '@/systemPages/AdminPages/UsersList/UsersList';
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
    response = await axios.get(process.env.NEXT_PUBLIC_API_URL + '/api/checkauth', {
      headers: { Cookie: "session=" + sessionCookie }
    });
  } catch (error) {
    console.log("[*] Error in /app/admin/users/page.jsx");
    console.log(error);
    redirect('/');
  }



  try{
    if(response !== undefined){
      if (response.status === 200){
        if(response.data.admin === 1){
          return <UsersListPage authdata={response.data}/>;
        }
      }
    }
  }
  catch(error){
    console.log("[*] Error in /app/admin/users/page.jsx");
    console.log(error);
    redirect('/');
  }
    


  redirect('/');
}
