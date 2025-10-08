using System;
using System.Collections.Generic;
using System.Linq;

namespace CertificateService.Core.Template
{
    /// <summary>
    /// Simple expression evaluator for template arithmetic.
    /// Evaluates expressions like: "cXLeft + 10" or "cYChildTop + (2 * cYChildOffset)"
    /// </summary>
    public class ExpressionEvaluator
    {
        private Dictionary<string, int> _constants;

        public ExpressionEvaluator(Dictionary<string, int> constants)
        {
            _constants = constants;
        }

        public int Evaluate(string expression)
        {
            try
            {
                // Replace constants with their values
                var resolved = expression;
                foreach (var constant in _constants.OrderByDescending(c => c.Key.Length))
                {
                    resolved = resolved.Replace(constant.Key, constant.Value.ToString());
                }

                // Now evaluate the arithmetic expression
                return EvaluateArithmetic(resolved);
            }
            catch
            {
                // If evaluation fails, return 0
                return 0;
            }
        }

        private int EvaluateArithmetic(string expression)
        {
            // Remove whitespace
            expression = expression.Replace(" ", "").Replace("\t", "");

            // Handle parentheses first
            while (expression.Contains("("))
            {
                int start = expression.LastIndexOf('(');
                int end = expression.IndexOf(')', start);
                if (end < 0) throw new Exception("Mismatched parentheses");

                string subExpr = expression.Substring(start + 1, end - start - 1);
                int subResult = EvaluateArithmetic(subExpr);
                expression = expression.Substring(0, start) + subResult + expression.Substring(end + 1);
            }

            // Now handle operators: * / first, then + -
            expression = EvaluateMultiplicationDivision(expression);
            expression = EvaluateAdditionSubtraction(expression);

            return int.Parse(expression);
        }

        private string EvaluateMultiplicationDivision(string expression)
        {
            while (true)
            {
                int mulPos = expression.IndexOf('*');
                int divPos = expression.IndexOf('/');

                if (mulPos < 0 && divPos < 0) break;

                int opPos = (mulPos >= 0 && divPos >= 0) ? Math.Min(mulPos, divPos) :
                           (mulPos >= 0 ? mulPos : divPos);
                char op = expression[opPos];

                // Find left operand
                int leftStart = opPos - 1;
                while (leftStart > 0 && (char.IsDigit(expression[leftStart - 1]) || expression[leftStart - 1] == '-'))
                    leftStart--;

                // Find right operand
                int rightEnd = opPos + 1;
                while (rightEnd < expression.Length && (char.IsDigit(expression[rightEnd]) || (rightEnd == opPos + 1 && expression[rightEnd] == '-')))
                    rightEnd++;

                int left = int.Parse(expression.Substring(leftStart, opPos - leftStart));
                int right = int.Parse(expression.Substring(opPos + 1, rightEnd - opPos - 1));
                int result = op == '*' ? left * right : left / right;

                expression = expression.Substring(0, leftStart) + result + expression.Substring(rightEnd);
            }

            return expression;
        }

        private string EvaluateAdditionSubtraction(string expression)
        {
            // Handle leading negative
            if (expression.StartsWith("-"))
                expression = "0" + expression;

            int pos = 1; // Start from 1 to skip potential leading sign
            while (pos < expression.Length)
            {
                if (expression[pos] == '+' || expression[pos] == '-')
                {
                    char op = expression[pos];

                    // Find left operand
                    int leftStart = 0;
                    for (int i = pos - 1; i >= 0; i--)
                    {
                        if (!char.IsDigit(expression[i]) && expression[i] != '-')
                        {
                            leftStart = i + 1;
                            break;
                        }
                    }

                    // Find right operand
                    int rightEnd = pos + 1;
                    while (rightEnd < expression.Length && (char.IsDigit(expression[rightEnd]) || (rightEnd == pos + 1 && expression[rightEnd] == '-')))
                        rightEnd++;

                    int left = int.Parse(expression.Substring(leftStart, pos - leftStart));
                    int right = int.Parse(expression.Substring(pos + 1, rightEnd - pos - 1));
                    int result = op == '+' ? left + right : left - right;

                    expression = expression.Substring(0, leftStart) + result + expression.Substring(rightEnd);
                    pos = leftStart + result.ToString().Length;
                }
                else
                {
                    pos++;
                }
            }

            return expression;
        }
    }
}
