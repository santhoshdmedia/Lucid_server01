import express from 'express';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['EMAIL_USERNAME', 'EMAIL_PASSWORD', 'ADMIN_EMAIL'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Initialize Express
const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many email attempts from this IP, please try again later'
});

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

const emailTemplates = {
  inquiryNotification: (values) => `
    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9f9f9;">
      <div style="max-width: 600px; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 3px 12px #034a9a;">
        <h2 style="background:#007BFF; color: white; padding: 12px; border-radius: 5px; text-align: center; font-size: 20px;">
          📩 New Inquiry Notification
        </h2>
        <p style="font-size: 16px; color: #333;">
          <strong>Name:</strong> ${values.name}<br>
          <strong>Email:</strong> ${values.email}<br>
          <strong>Subject:</strong> ${values.subject || 'Not provided'}<br>
          <strong>Message:</strong><br> ${values.message}
        </p>
        <hr style="border: 0; border-top: 1px solid #ddd;">
        <p style="text-align: center; font-size: 14px; color: #666;">
          Thank you for reaching out! Our team will get back to you soon.
        </p>
      </div>
    </div>
  `,

  confirmationEmail: (name = 'User', subject = 'your inquiry') => `
    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9f9f9;">
      <div style="max-width: 600px; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 3px 12px rgba(0,0,0,0.1);">
        <h2 style="color: #007BFF; text-align: center;">Thank you, ${name}!</h2>
        <p>We've received your inquiry about "${subject}" and will respond within 24 hours.</p>
        <p style="margin-top: 20px;">Best regards,<br>Lucid Petro Chemical Team</p>
      </div>
    </div>
  `
};

// Routes
app.post('/send-email', emailLimiter, async (req, res) => {
  try {
    // Input validation
    const { to, subject, name, message,phone } = req.body;

    if (!to || !subject || !name || !message||!phone) {
      return res.status(400).json({
        success: false,
        error: "All fields are required: recipient email, subject, name, and message"
      });
    }

    // Validate input types
    if (typeof to !== 'string' || typeof subject !== 'string' || 
        typeof name !== 'string' || typeof message !== 'string'|| typeof phone !== 'string') {
      return res.status(400).json({
        success: false,
        error: "Invalid input types"
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

    // Prepare admin notification email
    const adminHtml = await renderTemplate('welcome', {
      subject: sanitizedSubject,
      mobile:phone,
      email:to,
      name: sanitizedName,
      year: new Date().getFullYear(),
      companyName: "Lucid Petro Chemical",
      message: sanitizedMessage
    });

    const adminText = `New message from ${sanitizedName} (${to})\n\n`
      + `Subject: ${sanitizedSubject}\n\n`
      + `${sanitizedMessage}\n\n`
      + `---\nThis message was sent via your website contact form`;

    const adminMailOptions = {
      from: `"Lucid Petro Chemical" <${process.env.EMAIL_USERNAME}>`,
      to: process.env.ADMIN_EMAIL,
      replyTo: `"${sanitizedName}" <${to}>`,
      subject: `New Inquiry: ${sanitizedSubject}`,
      text: adminText,
      html: adminHtml,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High'
      }
    };

    // Send admin notification
    const adminResult = await sendEmail(adminMailOptions);
    if (!adminResult.success) {
      throw new Error("Failed to send email to admin");
    }

    // Send confirmation to user if different from admin
    if (to !== process.env.ADMIN_EMAIL) {
      const userMailOptions = {
        from: `"Lucid Petro Chemical" <${process.env.EMAIL_USERNAME}>`,
        to,
        subject: `We've received your message about ${sanitizedSubject}`,
        html: emailTemplates.confirmationEmail(sanitizedName, sanitizedSubject),
        text: `Dear ${sanitizedName},\n\nThank you for your message about "${sanitizedSubject}". We've received your inquiry and will respond within 24 hours.\n\nBest regards,\nLucid Petro Chemical Team`
      };
      await sendEmail(userMailOptions);
    }

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
    time: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ 
    success: false, 
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});