import { App } from 'aws-cdk-lib';
import { PortfolioApiStack } from './stack.js';
const app = new App();
new PortfolioApiStack(app);
app.synth();
