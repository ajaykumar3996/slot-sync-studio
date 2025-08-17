import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import JSZip from "npm:jszip@3.10.1";
import { getDocument } from "npm:pdfjs-dist@4.0.379/legacy/build/pdf.mjs";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BookingRequest {
  user_name: string;
  user_email: string;
  phone_number: string;
  client_name: string;
  role_name: string;
  job_description: string;
  resume_file_path?: string;
  team_details?: string;
  job_link?: string;
  message?: string;
  slot_date: string;
  slot_start_time: string;
  slot_end_time: string;
  slot_duration_minutes: number;
}

const fetchClientInfo = async (clientName: string, jobLink?: string | null): Promise<string> => {
  try {
    const searchTerm = clientName.toLowerCase().trim();
    
    const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(searchTerm + ' company')}&format=json&no_html=1&skip_disambig=1`);
    const data = await response.json();
    
    if (data.Abstract && data.Abstract.length > 0) {
      return data.Abstract.substring(0, 500) + (data.Abstract.length > 500 ? '...' : '');
    }
    
    return `${clientName} is a company. Additional information about this organization may be available through their website or professional profiles.`;
  } catch (error) {
    console.error('Error fetching client info:', error);
    return `${clientName} is a company.`;
  }
};

const encodeToBase64 = (str: string): string => {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  let binary = '';
  const len = data.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
};

const extractResumeText = async (
  arrayBuffer: ArrayBuffer,
  filename: string,
  mimeType?: string
): Promise<{ text: string; status: string }> => {
  const lower = filename.toLowerCase();
  try {
    if ((mimeType && mimeType.startsWith('text/')) || lower.endsWith('.txt') || lower.endsWith('.md')) {
      const text = new TextDecoder().decode(new Uint8Array(arrayBuffer));
      return { text, status: 'Extracted as plain text' };
    }
    
    if (lower.endsWith('.docx')) {
      const zip = await JSZip.loadAsync(arrayBuffer);
      const docFile = zip.file('word/document.xml');
      if (docFile) {
        const content = await docFile.async('string');
        const textContent = content
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (textContent) {
          return { text: textContent, status: 'Extracted from DOCX' };
        }
      }
      return { text: '', status: 'DOCX missing document.xml' };
    }
    
    if (lower.endsWith('.pdf') || mimeType === 'application/pdf') {
      try {
        const uint8Array = new Uint8Array(arrayBuffer);
        const doc = await getDocument({ data: uint8Array, useSystemFonts: true }).promise;
        let fullText = '';
        
        const maxPages = Math.min(doc.numPages, 10);
        for (let i = 1; i <= maxPages; i++) {
          const page = await doc.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .filter((item: any) => item.str)
            .map((item: any) => item.str)
            .join(' ');
          fullText += pageText + '\n';
        }
        
        const cleanedText = fullText
          .replace(/\s+/g, ' ')
          .replace(/\n+/g, '\n')
          .trim();
          
        if (cleanedText) {
          return { text: cleanedText, status: `Extracted from PDF (${maxPages} pages)` };
        } else {
          return { text: '', status: 'PDF text extraction returned empty content' };
        }
      } catch (pdfError) {
        console.error('PDF extraction error:', pdfError);
        return { text: '', status: `PDF extraction failed: ${pdfError.message || 'Unknown error'}` };
      }
    }
    
    return { text: '', status: 'Unsupported resume format for text extraction' };
  } catch (e) {
    console.error('Resume text extraction error:', e);
    return { text: '', status: `Resume extraction failed: ${e.message || 'Unknown error'}` };
  }
};

const serve_handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const bookingData: BookingRequest = await req.json();
    console.log('Received booking request:', bookingData);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const approvalToken = crypto.randomUUID();
    const { data: bookingRequest, error } = await supabase
      .from('booking_requests')
      .insert({
        user_name: bookingData.user_name,
        user_email: bookingData.user_email,
        phone_number: bookingData.phone_number,
        client_name: bookingData.client_name,
        role_name: bookingData.role_name,
        job_description: bookingData.job_description,
        resume_file_path: bookingData.resume_file_path,
        team_details: bookingData.team_details,
        job_link: bookingData.job_link,
        message: bookingData.message,
        slot_date: bookingData.slot_date,
        slot_start_time: bookingData.slot_start_time,
        slot_end_time: bookingData.slot_end_time,
        slot_duration_minutes: bookingData.slot_duration_minutes,
        approval_token: approvalToken,
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      throw new Error(`Failed to save booking request: ${error.message}`);
    }

    console.log('Booking request saved with ID:', bookingRequest.id);

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const approvalUrl = `https://rnkxaezxodhvrxameair.supabase.co/functions/v1/handle-booking-approval?token=${approvalToken}&action=approve`;
    const rejectionUrl = `https://rnkxaezxodhvrxameair.supabase.co/functions/v1/handle-booking-approval?token=${approvalToken}&action=reject`;

    console.log('Sending approval email to itmate.ai@gmail.com using Resend');

    let resumeAttachment: any = null;
    let resumeStatus = 'No resume provided';
    let resumeTextContent = '';
    const resumeFilename = bookingData.resume_file_path;

    if (resumeFilename) {
      try {
        console.log('Processing resume attachment for path:', resumeFilename);

        const { data: resumeData } = await supabase.storage
          .from('resumes')
          .download(resumeFilename);

        if (resumeData) {
          const resumeArrayBuffer = await resumeData.arrayBuffer();
          const mimeType = resumeData.type;
          const fileExtension = resumeFilename.split('.').pop() || 'pdf';
          const originalFilename = resumeFilename.split('-').slice(1).join('-');

          console.log('Resume data downloaded successfully, size:', resumeArrayBuffer.byteLength, 'type:', mimeType);
          console.log('Resume array buffer size:', resumeArrayBuffer.byteLength);

          const resumeBase64 = encodeToBase64(new Uint8Array(resumeArrayBuffer));
          console.log('Base64 conversion completed, length:', resumeBase64.length);

          resumeAttachment = {
            filename: `${bookingData.user_name.replace(/\s+/g, '_')}_resume.${fileExtension}`,
            content: resumeBase64,
            type: mimeType,
            disposition: 'attachment',
            headers: {
              'Content-Transfer-Encoding': 'base64'
            }
          };

          console.log('Attempting to extract text from resume...');
          const extraction = await extractResumeText(resumeArrayBuffer, originalFilename, mimeType);
          console.log('Extraction result:', extraction.status);
          if (extraction.text) {
            resumeTextContent = extraction.text;
            const MAX_CHARS = 150_000;
            if (resumeTextContent.length > MAX_CHARS) {
              resumeTextContent = resumeTextContent.slice(0, MAX_CHARS) + '\n\n...[truncated]';
            }
            resumeStatus = `Resume attached and text extracted (${extraction.status})`;
          } else {
            resumeStatus = `Resume attached (text not extracted - ${extraction.status})`;
          }
          console.log('Resume attachment prepared successfully');
        } else {
          console.error('No resume data returned from storage');
          resumeStatus = 'Resume download failed: No data returned';
        }
      } catch (error) {
        console.error('Error processing resume attachment:', error);
        resumeStatus = `Resume processing failed: ${error.message || error}`;
      }
    }

    const clientInfo = await fetchClientInfo(bookingData.client_name, bookingData.job_link);
    const resumeLine = resumeFilename ? `Attached - ${resumeFilename}` : 'Not provided';

    const roleName = bookingData.role_name;
    const jd = bookingData.job_description;
    const resumeTextForTemplate = resumeTextContent || 'Resume text could not be extracted. Please refer to the attached resume file.';

    // Create HTML template function with proper formatting
    const createHTMLTemplate = (content: string, title: string): string => {
      return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; margin: 40px; background: white; }
        h1, h2, h3 { color: #333; margin: 20px 0 10px 0; }
        strong { font-weight: bold; color: #333; }
        ul { margin: 15px 0; padding-left: 20px; }
        li { margin: 8px 0; }
        p { margin: 12px 0; }
        .placeholder { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #007bff; }
    </style>
</head>
<body>
${content.replace(/\n/g, '<br/>')}
</body>
</html>`;
    };

    // Your exact STAR template
    const starTemplateContent = `You are an AI assistant designed to simulate an interviewee for a job interview. Your task is to provide realistic, human-like responses to interview questions based on a given transcription.
- Here is the position you are interviewing for: ${roleName}
- You will be provided with a real-time transcription of the interview. This transcription may contain spelling and grammar mistakes. 
- Your goal is to identify the last question or topic being discussed and provide an appropriate response.

Instructions:
1. Carefully read the transcription and identify the last question or topic being discussed.
2. Consider how an experienced candidate for the ${roleName} role would respond.
3. Formulate a concise, precise, and human-like answer that directly addresses the question.
4. Provide your response in a conversational tone, as if you were speaking directly to the interviewer.

Your response should:
- Be tailored to the specific position you're interviewing for
- Demonstrate relevant skills and experience
- Be clear and articulate
- Maintain a professional yet personable tone
- Give the answers only in STAR Technique and provide a real life example , create a real life situation yourself and be ready to go through the depths of the question, be prepared for follow up questions on the STAR Technique and be ready to answer them. 
- When answering STAR Technique , Create a situation yourself and always be ready to dig deep into that follow up question on that situation.
- When a different question is asked about STAR Technique , create a different scenario , do not re use the same scenario multiple time and again be ready to dig deep into the scenario.
- So keep track of the project you explained in a STAR Technique question, until a different STAR question is asked.

Example output format:
**Question:** [Last question from the transcription]
**Situation:** [Your response to the question, formatted as natural speech, use markdown]
**Task:** [Your response to the question, formatted as natural speech, use markdown]
**Analysis:** [Your response to the question, formatted as natural speech, use markdown]
**Result:** [Your response to the question, formatted as natural speech, use markdown]

Please provide your response based on the last question or topic in the transcription and you should be as specific as possible. don't give any generic answers. be as specific as possible for these type of questions. specify the project and then create an exact scenario and go into as deep as possible and provide specific example for this. 

The following is a description of the company I am interviewing with today -
{
${clientInfo}
}

The following is the Job Description:-
{
${jd}
}

The following is the Resume:-
{
${resumeTextForTemplate}
}

**Instructions To be followed: 
Note: (If anything is asked outside of the resume, please answer the question and relate it to the resume and job description)

***Instructions:
1) When answering the questions Use a friendly and professional tone, avoiding overly technical jargon unless necessary.
   For example, when asked about yourself: 
- Introduce yourself, mentioning your name and current role 
- Summarize your professional experience, roles, and responsibilities focusing on key areas of expertise and significant achievements.
- Add a personal touch to make the conversation more relatable (Just 1 -2 lines).
(It should be in a paragraph not exceeding 6-7 lines).

2) When answering Behavioral, Real-time, Scenario , Client Management Scenario, Problem-Solving Scenario, Conflict Resolution Scenario, Team Collaboration Scenario based questions  , Answer questions using the STAR method (Situation, Task, Action, Result) for here's a set of prompts tailored for each situation. This method will provide structured, clear, and relevant responses.

- Situation: Describe the high-pressure situation or context.
- Task: State the task or responsibility you had.
- Action: Describe the specific steps you took to address the situation.
- Result: Explain the outcome or results of your actions.

3) Short, Direct Answer Identification Prompt:
When the question focuses on a specific tool, method, or responsibility, respond directly with a concise answer. Avoid providing additional details or elaboration beyond what is necessary.

Important instruction : ( Please don't give Artificial Intelligence answers and too much of description for normal simple questions, When answering most of the times directly start with the context, topic asked instead of giving lengthy introductions for everything asked and do not repeat the question in the answer , start directly from the actual point.
And when answering about projects assume a most real time project relevant and suitable to roles and responsibilities of that specific company/client from resume and answer the question in simple manner , by mentioning only required steps instead of mentioning all unnecessary steps and procedures.

Very Important instruction : (* If there is/are no projects mentioned in resume , you only create a real time project and answer accordingly when asked for real time scenario questions and situational based questions*).

Enhanced Prompt for better answers:-
Here’s a refined prompt designed to ensure outputs align with the instructions:-
Context:
- You are an expert professional, trained to provide concise, human-like, and contextually relevant answers for various technical, behavioral, and scenario-based questions. Your tone is friendly yet professional, and you adapt your answers based on the complexity of the question.
For behavioral questions, provide real-world examples aligned with professional experiences, keeping them concise yet impactful.
Adapt responses to reflect real-time project experience, creating examples if necessary to align with the job role.
Examples like how to answer : ( These are just examples , based on these please give more better and accurate answers with perfect explanation ) 
Reasoning (Technical Role):
Question: "How do you balance technical debt with the need to deliver features quickly?"
Response: "Balancing technical debt requires prioritizing tasks. I’d evaluate the criticality of the feature, set aside time for incremental refactoring, and use tools like SonarQube to identify and manage debt while aligning with business needs."

4) Contextual Adaptation:
- Adapt responses based on the complexity of the question:
- Simple or direct questions: Provide a brief, clear answer without going into unnecessary detail.
- Complex questions: Start with a concise summary of the solution and expand into more detail only if requested.
- Avoid long-winded introductions; directly address the question or topic. For projects, focus on real-time examples relevant to the role or client, simplifying where possible.

5) When Additional Detail is Requested:
- If the user asks for more information or clarification, provide a structured breakdown of the answer in steps, but always start with a short summary.
- Break down responses only when the question requires clarity on multiple points or steps.

6) Responding Like a Human:
- Avoid sounding like a machine by using natural, conversational language. Respond as a human would, focusing on real-world experiences, practical examples, and insights.
- Relate answers to the job description and resume, creating connections between your expertise and the role in question.
- Imp instruction : If a project isn’t mentioned in the resume, create a relevant real-time example that aligns with the role’s responsibilities and describe it as if it were real.

7) ** Example Responses: These are just examples , for these type of questions when you have a direct answer just give the answer
- Question: "How do you ensure data lineage in an event-driven architecture?"
- Direct Answer: "I ensure data lineage by using centralized logging to capture event metadata, a schema registry for version control, and tools like Kafka to maintain traceability."

8) *Final Key Points:*
- Prioritize conciseness: Most questions should be answered in 3-4 lines or a single paragraph unless more details are requested.
- Use the STAR method for behavioral and scenario-based questions to keep responses structured and clear.
- Adapt the response to the complexity of the question—be brief for simple questions, and expand only when necessary.
- Always relate your answers based on your experience and technical knowledge, ensuring responses feel authentic and relevant.

**** Most Important thing : - 
1) The speed of generating answers for the questions asked should be full fast like a bullet train.
2) Please Give complete Humanized answers in a professional technical way. Please fine tune answers and don't give artificial answers.
`.trim();

    // Your exact standard template
    const standardDocContent = `You are an AI assistant designed to simulate an interviewee for a job interview. Your task is to provide realistic, human-like responses to interview questions based on a given transcription.
- Here is the position you are interviewing for: ${roleName}
- You will be provided with a real-time transcription of the interview. This transcription may contain spelling and grammar mistakes. 
- Your goal is to identify the last question or topic being discussed and provide an appropriate response.

Instructions:
1. Carefully read the transcription and identify the last question or topic being discussed.
2. Consider how an experienced candidate for the ${roleName} role would respond.
3. Formulate a concise, precise, and human-like answer that directly addresses the question.
4. Provide your response in a conversational tone, as if you were speaking directly to the interviewer.

Your response should:
- Be tailored to the specific position you're interviewing for
- Demonstrate relevant skills and experience
- Be clear and articulate
- Maintain a professional yet personable tone
- When answering STAR Technique , Create a situation yourself and always be ready to dig deep into that follow up question on that situation.
- When a different question is asked about STAR Technique , create a different scenario , do not re use the same scenario multiple time and again be ready to dig deep into the scenario.
- So keep track of the project you explained in a STAR Technique question, until a different STAR question is asked.

Example output format:
**Question:** [Last question from the transcription]
**Answer:** [Your response to the question, formatted as natural speech, use markdown]
- Please provide your response based on the last question or topic in the transcription.
- Be as specific as possible while answering questions and don't use any complicated words, use simple English and be as specific as possible and give answers to the point. don't give useless information for example : if the question is "what is the importance of using tableu?" , just start with the answer , do not give these sentences like "the importance of tableu are:"
both at the beginning of the answer and at the ending , use really simple and humanized words that everyone uses on a regular day to day life.


The following is a description of the company I am interviewing with today -
{

${clientInfo}

}

The following is the Job Description:-
{

${jd}

}

The following is the Resume:-
{

${resumeTextForTemplate}

}

**Instructions To be followed: 
Note: (If anything is asked outside of the resume, please answer the question and relate it to the resume and job description)

***Instructions:
1) When answering the questions Use a friendly and professional tone, avoiding overly technical jargon unless necessary.
   For example, when asked about yourself: 
- Introduce yourself, mentioning your name and current role 
- Summarize your professional experience, roles, and responsibilities focusing on key areas of expertise and significant achievements.
- Add a personal touch to make the conversation more relatable (Just 1 -2 lines).
(It should be in a paragraph not exceeding 6-7 lines).

2) When answering Behavioral, Real-time, Scenario , Client Management Scenario, Problem-Solving Scenario, Conflict Resolution Scenario, Team Collaboration Scenario based questions  , Answer questions using the STAR method (Situation, Task, Action, Result) for here's a set of prompts tailored for each situation. This method will provide structured, clear, and relevant responses.

- Situation: Describe the high-pressure situation or context.
- Task: State the task or responsibility you had.
- Action: Describe the specific steps you took to address the situation.
- Result: Explain the outcome or results of your actions.

3) Short, Direct Answer Identification Prompt:
When the question focuses on a specific tool, method, or responsibility, respond directly with a concise answer. Avoid providing additional details or elaboration beyond what is necessary.

Important instruction : ( Please don't give Artificial Intelligence answers and too much of description for normal simple questions, When answering most of the times directly start with the context, topic asked instead of giving lengthy introductions for everything asked and do not repeat the question in the answer , start directly from the actual point. 
And when answering about projects assume a most real time project relevant and suitable to roles and responsibilities of that specific company/client from resume and answer the question in simple manner , by mentioning only required steps instead of mentioning all unnecessary steps and procedures.

Very Important instruction : (* If there is/are no projects mentioned in resume , you only create a real time project and answer accordingly when asked for real time scenario questions and situational based questions*).

Enhanced Prompt for better answers:-
Here's a refined prompt designed to ensure outputs align with the instructions:-
Context:
- You are an expert professional, trained to provide concise, human-like, and contextually relevant answers for various technical, behavioral, and scenario-based questions. Your tone is friendly yet professional, and you adapt your answers based on the complexity of the question.
For behavioral questions, provide real-world examples aligned with professional experiences, keeping them concise yet impactful.
Adapt responses to reflect real-time project experience, creating examples if necessary to align with the job role.
Examples like how to answer : ( These are just examples , based on these please give more better and accurate answers with perfect explanation ) 
Reasoning (Technical Role):
Question: "How do you balance technical debt with the need to deliver features quickly?"
Response: "Balancing technical debt requires prioritizing tasks. I'd evaluate the criticality of the feature, set aside time for incremental refactoring, and use tools like SonarQube to identify and manage debt while aligning with business needs."

4) Contextual Adaptation:
- Adapt responses based on the complexity of the question:
- Simple or direct questions: Provide a brief, clear answer without going into unnecessary detail.
- Complex questions: Start with a concise summary of the solution and expand into more detail only if requested.
- Avoid long-winded introductions; directly address the question or topic. For projects, focus on real-time examples relevant to the role or client, simplifying where possible.

5) When Additional Detail is Requested:
- If the user asks for more information or clarification, provide a structured breakdown of the answer in steps, but always start with a short summary.
- Break down responses only when the question requires clarity on multiple points or steps.

6) Responding Like a Human:
- Avoid sounding like a machine by using natural, conversational language. Respond as a human would, focusing on real-world experiences, practical examples, and insights.
- Relate answers to the job description and resume, creating connections between your expertise and the role in question.
- Imp instruction : If a project isn't mentioned in the resume, create a relevant real-time example that aligns with the role's responsibilities and describe it as if it were real.

7) ** Example Responses: These are just examples , for these type of questions when you have a direct answer just give the answer
- Question: "How do you ensure data lineage in an event-driven architecture?"
- Direct Answer: "I ensure data lineage by using centralized logging to capture event metadata, a schema registry for version control, and tools like Kafka to maintain traceability."

8) *Final Key Points:*
- Prioritize conciseness: Most questions should be answered in 3-4 lines or a single paragraph unless more details are requested.
- Use the STAR method for behavioral and scenario-based questions to keep responses structured and clear.
- Adapt the response to the complexity of the question—be brief for simple questions, and expand only when necessary.
- Always relate your answers based on your experience and technical knowledge, ensuring responses feel authentic and relevant.

**** Most Important thing : - 
1) The speed of generating answers for the questions asked should be full fast like a bullet train.
2) Please Give complete Humanized answers in a professional technical way. Please fine tune answers and don't give artificial answers.`.trim();

    // Create HTML templates
    const starHTMLContent = createHTMLTemplate(starTemplateContent, "STAR Technique Template");
    const standardHTMLContent = createHTMLTemplate(standardDocContent, "Content Standard Template");

    // Prepare attachments
    const attachments = [] as any[];
    if (resumeAttachment) attachments.push(resumeAttachment);
    attachments.push({
      filename: `STAR_Technique_${bookingData.user_name.replace(/\s+/g, '_')}.html`,
      content: encodeToBase64(starHTMLContent),
      type: 'text/html; charset=utf-8',
      disposition: 'attachment'
    });
    attachments.push({
      filename: `Content_Standard_${bookingData.user_name.replace(/\s+/g, '_')}.html`,
      content: encodeToBase64(standardHTMLContent),
      type: 'text/html; charset=utf-8',
      disposition: 'attachment'
    });

    const emailResponse = await resend.emails.send({
      from: "Book My Slot <anand@bookmyslot.me>",
      to: ["itmate.ai@gmail.com"],
      subject: `New Booking Request - ${bookingData.role_name} at ${bookingData.client_name}`,
      html: `
        <h2>New Booking Request</h2>
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Personal Information</h3>
          <p><strong>Name:</strong> ${bookingData.user_name}</p>
          <p><strong>Email:</strong> ${bookingData.user_email}</p>
          <p><strong>Phone:</strong> ${bookingData.phone_number}</p>
          
          <h3>Job Information</h3>
          <p><strong>Client/Company:</strong> ${bookingData.client_name}</p>
          <p><strong>Role:</strong> ${bookingData.role_name}</p>
          <p><strong>Job Description:</strong> ${bookingData.job_description}</p>
          ${bookingData.team_details ? `<p><strong>Team:</strong> ${bookingData.team_details}</p>` : ''}
          ${bookingData.job_link ? `<p><strong>Job Link:</strong> <a href="${bookingData.job_link}" target="_blank">${bookingData.job_link}</a></p>` : ''}
          
          <h3>Interview Details</h3>
          <p><strong>Date:</strong> ${bookingData.slot_date}</p>
          <p><strong>Time:</strong> ${bookingData.slot_start_time} - ${bookingData.slot_end_time} CST</p>
          <p><strong>Duration:</strong> ${bookingData.slot_duration_minutes} minutes</p>
          
          <h3>Resume Status</h3>
          <p>${resumeAttachment ? '📄 Resume is attached to this email' : `⚠️ ${resumeStatus}`}</p>

          <h3>Templates</h3>
          <p>Two AI assistant templates are attached as HTML files with proper formatting and placeholders filled.</p>
        </div>
        
        <div style="margin: 20px 0;">
          <a href="${approvalUrl}" 
             style="background: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-right: 10px;">
            ✅ APPROVE
          </a>
          <a href="${rejectionUrl}" 
             style="background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            ❌ REJECT
          </a>
        </div>
      `,
      attachments
    });

    console.log('Approval email sent successfully:', emailResponse);

    return new Response(
      JSON.stringify({ 
        success: true, 
        bookingId: bookingRequest.id,
        message: 'Booking request submitted successfully. You will receive a confirmation email once approved.' 
      }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in submit-booking-request function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to process booking request', 
        details: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(serve_handler);
