

import express from 'express';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import cors from 'cors';

// Load environment variables
dotenv.config();

// Initialize Express
const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Email transporter configuration
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD
    }
  });
};

const transporter = createTransporter();

// Verify transporter connection
transporter.verify((error) => {
  if (error) {
    console.error('Error with mail transporter:', error);
  } else {
    console.log('Mail transporter is ready to send emails');
  }
});

// Email template renderer
const renderTemplate = async (templateName, data) => {
  try {
    const templatePath = path.join(__dirname, 'templates', `${templateName}.ejs`);
    return await ejs.renderFile(templatePath, data);
  } catch (error) {
    console.error('Error rendering template:', error);
    throw new Error('Failed to render email template');
  }
};

// Email sending function
const sendEmail = async (mailOptions) => {
  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Email sending error:', error);
    return { success: false, error: error.message };
  }
};

// Routes
app.post('/send-email', async (req, res) => {
  // Input validation
  const { to, subject, name, message } = req.body;

  if (!to || !subject || !name || !message) {
    return res.status(400).json({
      success: false,
      error: "All fields are required: recipient email, subject, name, and message"
    });
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return res.status(400).json({
      success: false,
      error: "Please provide a valid email address"
    });
  }

  // Input sanitization
  const sanitizedSubject = subject.substring(0, 100);
  const sanitizedName = name.substring(0, 50);
  const sanitizedMessage = message.substring(0, 2000);

  try {
    // Rate limiting check could be added here
    
    // Render HTML template
    const html = await renderTemplate('welcome', {
      subject: sanitizedSubject,
      name: sanitizedName,
      year: new Date().getFullYear(),
      companyName: "Your Company",
      message: sanitizedMessage
    });

    // Create text version
    const text = `New message from ${sanitizedName} (${to})\n\n`
      + `Subject: ${sanitizedSubject}\n\n`
      + `${sanitizedMessage}\n\n`
      + `---\nThis message was sent via your website contact form`;

    // Send email
    const mailOptions = {
      from: `"Website Contact" <${process.env.EMAIL_USERNAME}>`,
      to: process.env.ADMIN_EMAIL || to, // Send to admin by default
      replyTo: to, // Allow direct replies to sender
      subject: `Website Contact: ${sanitizedSubject}`,
      text,
      html,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High'
      }
    };

    const result = await sendEmail(mailOptions);

    if (!result.success) {
      console.error('Email failed:', result.error);
      throw new Error("Failed to send email. Please try again later.");
    }

    // Send confirmation to user if different from admin
    // if (to !== process.env.ADMIN_EMAIL) {
    //   const userMailOptions = {
    //     from: `"Lucid" <${process.env.EMAIL_USERNAME}>`,
    //     to,
    //     subject: `Thank you for contacting us about ${sanitizedSubject}`,
    //     text: `Dear ${sanitizedName},\n\nThank you for your message. We'll get back to you soon.\n\nBest regards,\nLucid Team`,
    //     html: await renderTemplate('confirmation', {
    //       name: sanitizedName,
    //       subject: sanitizedSubject
    //     })
    //   };
    //   await sendEmail(userMailOptions);
    // }

    return res.json({
      success: true,
      message: "Your message has been sent successfully"
    });

  } catch (error) {
    console.error('Email endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || "An unexpected error occurred"
    });
  }
});
// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    time: new Date().toISOString() 
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});