# ArrayDeque

双端队列

ArrayDeque 是可调整大小的双端队列实现。

用作栈的实现，性能优于 Stack

用作队列的实现，性能优于 LinkedList

# Motivation

从尾追加数据，从头出列数据，会出现实际数组有空的单元，但却 tail 会超过数组容量的情况，我们称之为假溢出；
但往往，不可能是一种容量固定的数组，一般会有实现自动扩容的方法，但即便可以扩容，按照上面的逻辑，数组容量不断扩大，tail 值一直向后，
但从头出列的数据越来起多，前面空的内存单造成的浪费更是不能忽略了。所以，为了解决数组单元浪费的问题，就产生了循环数组

```java
public class ArrayDeque<E> extends AbstractCollection<E>
        implements Deque<E>, Cloneable, Serializable {
         ...省略
        }
```

::: tip 重要

- 底层通过循环数组实现 俩个重要属性 head tail
- 不能添加 null 值，不然会报空指针
- 可以实现普通队列先进先出排序，也可以实现栈先进后出的排序
- 特别留意，它里面通过二进制方式判断数组是否已满 (tail = (tail + 1) & (elements.length - 1)) == head
- 注意操作插入和移除时，有 Throws exception 和 return Special value 俩种情况

:::

## 属性

```java
    // 存放数据的数组
    transient Object[] elements;
    // 头部索引，指向需要出列的元素
    transient int head;
    // 尾部索引，代表着下一个添加进来元素的位置
    transient int tail;
    /**
    *   数组的容量应该是2的次方，最小8
    *   为什么数组的大小要是2的幂次方呢？既然是循环数组 当head为0是时减1为负数肯定是不行的 那么直接根据长度
    *   进行取模就是 我们的下标 index % len = index & (length - 1) 当长度为2的幂次方时 计算可以这样优化这也是为什么
    *   数组的容量要是2的幂次方
    *   eg: 比如现在 idnex=0 数组长度是8 （0-1) & (7) = 7 那么这样就实现了循环数组了
    */
    private static final int MIN_INITIAL_CAPACITY = 8;

```

## 方法

### calculateSize

根据传进来的直接返回最接近的 2 幂次方的大小，至于为什么？得看后续

```java

    private static int calculateSize(int numElements) {
        int initialCapacity = MIN_INITIAL_CAPACITY;
        // Find the best power of two to hold elements.
        // Tests "<=" because arrays aren't kept full.
        if (numElements >= initialCapacity) {
            initialCapacity = numElements;
            initialCapacity |= (initialCapacity >>> 1);
            initialCapacity |= (initialCapacity >>> 2);
            initialCapacity |= (initialCapacity >>> 4);
            initialCapacity |= (initialCapacity >>> 8);
            initialCapacity |= (initialCapacity >>> 16);
            initialCapacity++;
            // 最高位1代表负数无符号右移1位得到最大值
            if (initialCapacity < 0)   // Too many elements, must back off
                initialCapacity >>>= 1;// Good luck allocating 2 ^ 30 elements
        }
        return initialCapacity;
    }
```

举个例子我们传入 13 进去计算：

int 型 4 字节 4 \* 8 = 32 位

| 　　 　             | 二进制                                  |
| :------------------ | --------------------------------------- |
| 13 的二进制         | 0000 0000 0000 0000 0000 0000 0000 1110 |
| 13 无符号右移 1 位  | 0000 0000 0000 0000 0000 0000 0000 0111 |
| 或操作              | 0000 0000 0000 0000 0000 0000 0000 1111 |
| 13 无符号右移 2 位  | 0000 0000 0000 0000 0000 0000 0000 0011 |
| 或操作              | 0000 0000 0000 0000 0000 0000 0000 1111 |
| 13 无符号右移 4 位  | 0000 0000 0000 0000 0000 0000 0000 0000 |
| 或操作              | 0000 0000 0000 0000 0000 0000 0000 1111 |
| 13 无符号右移 8 位  | 0000 0000 0000 0000 0000 0000 0000 0000 |
| 或操作              | 0000 0000 0000 0000 0000 0000 0000 1111 |
| 13 无符号右移 16 位 | 0000 0000 0000 0000 0000 0000 0000 0000 |
| 或操作              | 0000 0000 0000 0000 0000 0000 0000 1111 |

这里我们就能看出端倪，位运算完为 2^4 -1；最后 initialCapacity++ 为 16

运算到最后无符号右移 16 刚好把高 16 位的值全部刷成 1，所以该运算能得出大于当前值的最小 2 的幂次方了

### addFirst

ArrayDeque 初始化的时候 head,tail=0

```java

    public void addFirst(E e) {
        // 非空
        if (e == null)
            throw new NullPointerException();
        // 计算头部索引位置
        elements[head = (head - 1) & (elements.length - 1)] = e;
        // 如果头部索引与尾部索引相同那么就说明数组已经塞满，需要扩容
        if (head == tail)
            doubleCapacity();
    }
```

### addLast

```java
    public void addLast(E e) {
        // 非空
        if (e == null)
            throw new NullPointerException();
        // 直接在尾部index放置元素
        elements[tail] = e;
        // 尾部指针向右移动 并且判断是否与头部指针重合 如果重合那么就执行扩容方法
        if ((tail = (tail + 1) & (elements.length - 1)) == head)
            doubleCapacity();
    }
```

### doubleCapacity

```java
    private void doubleCapacity() {
        // 双倍扩容的前提量 首位指针重合
        assert head == tail;
        // 头部指针位置
        int p = head;
        // 数组长度
        int n = elements.length;
        // P指针右边元素个数
        int r = n - p; // number of elements to the right of p
        // 左移一位 即 长度 * 4
        int newCapacity = n << 1;
        if (newCapacity < 0)
            throw new IllegalStateException("Sorry, deque too big");
        // 创建新的数组
        Object[] a = new Object[newCapacity];
        // 从P开始右边 r 个元素复制过去
        System.arraycopy(elements, p, a, 0, r);
        // 原数组从0开始 目标数组之前已经copy了r个元素那么从r开始 copy p个元素 这样才是正确的顺序
        System.arraycopy(elements, 0, a, r, p);
        elements = a;
        // 重置 头尾指针
        head = 0;
        tail = n;
    }

```

### pollFirst

```java
    /**
    *   移除队头
    *
    */
    public E pollFirst() {
        // 那么头指针的元素要移除队头
        int h = head;
        @SuppressWarnings("unchecked")
        E result = (E) elements[h];
        // 如果队列为空返回空
        // Element is null if deque empty
        if (result == null)
            return null;
        // GC help
        elements[h] = null;     // Must null out slot
        // 头部索引向右移动一位
        head = (h + 1) & (elements.length - 1);
        return result;
    }
```

### pollLast
